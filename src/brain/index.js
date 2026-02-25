import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './prompt.js';
import * as conversation from './conversation.js';
import { getToolDefinitions, executeTool } from '../tools/index.js';
import log from '../utils/logger.js';
import { recordUsage } from '../utils/usage-log.js';
import { estimateCost } from '../utils/claude-pricing.js';
import { recordConversationEval } from '../utils/eval-logger.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

export async function think(envelope, onAcknowledge) {
  const loopStartedAt = Date.now();
  let promptTokensTotal = 0;
  let completionTokensTotal = 0;
  let totalCostUsd = 0;
  const toolsCalled = [];

  const systemPrompt = buildSystemPrompt({
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
  const userMessage = { role: 'user', content: envelope.message };
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

      recordConversationEval({
        conversation_id: envelope.conversation_id ?? 'unknown',
        person_id: envelope.person_id ?? envelope.person ?? 'unknown',
        user_message: envelope.message ?? '',
        assistant_response: finalText,
        tools_called: toolsCalled,
        prompt_tokens: promptTokensTotal,
        completion_tokens: completionTokensTotal,
        total_cost_usd: Math.round(totalCostUsd * 1e6) / 1e6,
        response_time_ms: Date.now() - loopStartedAt,
      });

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
