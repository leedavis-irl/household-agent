import { createInterface } from 'readline';
import { resolve } from './identity.js';
import { sendReply } from '../router/index.js';
import { think } from '../brain/index.js';
import log from '../utils/logger.js';

export function start() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Default to "lee" for CLI; can be overridden with CLI_USER env var
  const cliUser = process.env.CLI_USER || 'lee';
  const person = resolve('cli', cliUser);

  if (!person) {
    log.error('Unknown CLI user', { cliUser });
    process.exit(1);
  }

  log.info('Iji ready', { user: person.display_name, role: person.role });

  const conversationId = `${person.id}-cli-${new Date().toISOString().slice(0, 10)}`;

  function prompt() {
    rl.question(`${person.display_name}: `, async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed.toLowerCase() === 'quit') {
        log.info('CLI session ended');
        rl.close();
        process.exit(0);
      }

      const envelope = {
        person_id: person.id,
        person: person.display_name,
        role: person.role,
        permissions: person.permissions,
        message: trimmed,
        source_channel: 'cli',
        reply_address: 'cli',
        conversation_id: conversationId,
        timestamp: new Date().toISOString(),
      };

      try {
        const response = await think(envelope, (ack) => {
          sendReply(envelope, ack);
        });
        sendReply(envelope, response);
      } catch (err) {
        log.error('Brain error', { error: err.message });
      }

      prompt();
    });
  }

  prompt();
}
