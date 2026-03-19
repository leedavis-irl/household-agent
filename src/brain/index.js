import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './prompt.js';
import * as conversation from './conversation.js';
import { getToolDefinitions, executeTool } from '../tools/index.js';
import log from '../utils/logger.js';
import { recordUsage } from '../utils/usage-log.js';
import { estimateCost } from '../utils/claude-pricing.js';
import { recordConversationEval } from '../utils/eval-logger.js';
import { reviewQuality } from '../utils/quality-reviewer.js';

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

export async function think(envelope, onAcknowledge) {
  const loopStartedAt = Date.now();
  let promptTokensTotal = 0;
  let completionTokensTotal = 0;
  let totalCostUsd = 0;
  const toolsCalled = [];

  const { prompt: systemPrompt, layers, capabilitiesLoaded } = buildSystemPrompt({
    person: {
      display_name: envelope.person,
      role: envelope.role,
      permissions: envelope.permissions,
      isGroup: !!envelope.group_id,
    },
    user_message: envelope.message,
    person_id: envelope.person_id,
  });

  // Build messages: prior conversation history + new user message
  const history = conversation.get(envelope.conversation_id);

  // Build user message content — plain text or multimodal (images + text)
  let userContent;
  if (envelope.images && envelope.images.length > 0) {
    userContent = [
      ...envelope.images.map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.media_type, data: img.base64 },
      })),
      { type: 'text', text: envelope.message },
    ];
    log.info('Building multimodal message', { imageCount: envelope.images.length, textLength: envelope.message.length });
  } else {
    userContent = envelope.message;
  }

  const userMessage = { role: 'user', content: userContent };
  const messages = [...history, userMessage];

  let isFirstIteration = true;

  // The tool-use loop
  while (true) {
    log.debug('Calling Claude', { iteration: isFirstIteration ? 1 : 'continuation' });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: getToolDefinitions(),
      messages,
    });

    const usage = response.usage;
    if (usage) {
      const model = response.model ?? MODEL;
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      promptTokensTotal += inputTokens;
      completionTokensTotal += outputTokens;
      totalCostUsd += estimateCost(model, inputTokens, outputTokens);
      recordUsage(envelope, model, { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens });
    }

    // Check if the response has any tool_use blocks
    const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
    const textBlocks = response.content.filter((block) => block.type === 'text');

    if (toolUseBlocks.length === 0) {
      // No tool calls — we're done. Extract text.
      const finalText = textBlocks.map((b) => b.text).join('\n');

      // Save conversation history
      conversation.append(envelope.conversation_id, [
        userMessage,
        { role: 'assistant', content: response.content },
      ]);

      // Estimate per-layer token counts using char ratios against actual first-call input tokens
      const totalLayerChars = layers.reduce((sum, l) => sum + l.chars, 0) || 1;
      const layerTokens = layers.map((l) => ({
        name: l.name,
        chars: l.chars,
        estimated_tokens: Math.round((l.chars / totalLayerChars) * promptTokensTotal),
      }));

      const evalEntry = {
        conversation_id: envelope.conversation_id ?? 'unknown',
        person_id: envelope.person_id ?? envelope.person ?? 'unknown',
        user_message: envelope.message ?? '',
        assistant_response: finalText,
        tools_called: toolsCalled,
        capabilities_loaded: capabilitiesLoaded,
        layer_tokens: layerTokens,
        prompt_tokens: promptTokensTotal,
        completion_tokens: completionTokensTotal,
        total_cost_usd: Math.round(totalCostUsd * 1e6) / 1e6,
        response_time_ms: Date.now() - loopStartedAt,
      };
      const evalRowId = recordConversationEval(evalEntry);

      // Async quality review — runs after response is returned, doesn't block
      if (evalRowId != null) {
        const messagesSnapshot = [...messages];
        setImmediate(() => reviewQuality(evalEntry, evalRowId, messagesSnapshot));
      }

      return finalText;
    }

    // Tools needed — send acknowledgment on first iteration
    if (isFirstIteration && onAcknowledge) {
      const ackText = textBlocks.length > 0
        ? textBlocks.map((b) => b.text).join('\n')
        : 'Let me check on that...';
      onAcknowledge(ackText);
      isFirstIteration = false;
    }

    // Append assistant message with tool_use blocks
    messages.push({ role: 'assistant', content: response.content });

    // Execute all tools in parallel
    for (const toolUse of toolUseBlocks) {
      toolsCalled.push(toolUse.name);
    }

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (toolUse) => {
        const result = await executeTool(toolUse.name, toolUse.input, envelope);
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        };
      })
    );

    // Append tool results and loop
    messages.push({ role: 'user', content: toolResults });
  }
}
