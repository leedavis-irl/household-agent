import * as cli from './cli.js';
import * as signal from './signal.js';
import log from '../utils/logger.js';

const channels = { cli, signal };

export function sendReply(envelope, text) {
  if (text == null || String(text).trim() === '') return;

  const channel = channels[envelope.source_channel];
  if (!channel) {
    log.warn('No adapter for channel', { channel: envelope.source_channel, textLength: text?.length });
    return;
  }

  log.debug('sendReply', { channel: envelope.source_channel, reply_address: envelope.reply_address, group_id: envelope.group_id ?? null });

  if (envelope.source_channel === 'signal') {
    channel.send(text, envelope.reply_address, envelope.group_id);
  } else {
    channel.send(text);
  }
}
