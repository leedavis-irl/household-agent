import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './prompt.js';
import * as conversation from './conversation.js';
import { getToolDefinitions, executeTool } from '../tools/index.js';
import log from '../utils/logger.js';
import { recordUsage } from '../utils/usage-log.js';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

export async function think(envelope, onAcknowledge) {
  const systemPrompt = buildSystemPrompt({
    display_name: envelope.person,
    role: envelope.role,
    permissions: envelope.permissions,
    isGroup: !!envelope.group_id,
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
