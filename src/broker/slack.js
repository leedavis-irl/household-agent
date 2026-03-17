import pkg from '@slack/bolt';
const { App } = pkg;
import { resolve } from './identity.js';
import { sendReply } from '../router/index.js';
import { think } from '../brain/index.js';
import log from '../utils/logger.js';

let app = null;

/**
 * Send a Slack message to a channel/DM.
 * @param {string} channel - Slack channel or DM ID
 * @param {string} text - Message text
 * @param {string} [threadTs] - Thread timestamp to reply in
 */
export function sendSlackMessage(channel, text, threadTs) {
  if (!app) {
    log.error('Slack send failed: app not initialized');
    return false;
  }
  app.client.chat.postMessage({
    channel,
    text,
    thread_ts: threadTs || undefined,
  }).catch((err) => {
    log.error('Slack send failed', { channel, error: err.message });
  });
  return true;
}

function handleSlackMessage(person, messageText, channel, threadTs) {
  const dateKey = new Date().toISOString().slice(0, 10);
  const conversationId = `${person.id}-slack-${dateKey}`;

  const msgEnvelope = {
    person_id: person.id,
    person: person.display_name,
    role: person.role,
    permissions: person.permissions,
    message: messageText,
    source_channel: 'slack',
    reply_address: channel,
    slack_thread_ts: threadTs || null,
    group_id: null,
    conversation_id: conversationId,
    timestamp: new Date().toISOString(),
  };

  think(msgEnvelope, (ack) => {
    sendReply(msgEnvelope, ack);
  })
    .then((response) => {
      sendReply(msgEnvelope, response);
    })
    .catch((err) => {
      log.error('Brain error (Slack)', { error: err.message, from: person.display_name });
      sendSlackMessage(channel, 'Sorry, I hit an error processing that. Try again in a moment.', threadTs);
    });
}

function handleSlackChannelMessage(person, messageText, channel, threadTs) {
  const dateKey = new Date().toISOString().slice(0, 10);
  const conversationId = `slack-channel-${channel}-${dateKey}`;

  const msgEnvelope = {
    person_id: person.id,
    person: person.display_name,
    role: person.role,
    permissions: person.permissions,
    message: messageText,
    source_channel: 'slack',
    reply_address: channel,
    slack_thread_ts: threadTs || null,
    group_id: channel,
    conversation_id: conversationId,
    timestamp: new Date().toISOString(),
  };

  think(msgEnvelope, (ack) => {
    if (ack != null && ack.trim() !== '') sendReply(msgEnvelope, ack);
  })
    .then((response) => {
      if (response != null && response.trim() !== '') sendReply(msgEnvelope, response);
    })
    .catch((err) => {
      log.error('Brain error (Slack channel)', { error: err.message, from: person.display_name });
      sendSlackMessage(channel, 'Sorry, I hit an error processing that. Try again in a moment.', threadTs);
    });
}

export function start() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;

  if (!botToken || !appToken) {
    log.warn('Slack channel disabled: SLACK_BOT_TOKEN or SLACK_APP_TOKEN not set');
    return;
  }

  app = new App({
    token: botToken,
    appToken,
    socketMode: true,
    logLevel: 'ERROR',
  });

  // Handle DMs
  app.event('message', async ({ event }) => {
    // Skip bot messages, message edits, and subtype messages (join, leave, etc.)
    if (event.subtype) return;
    if (event.bot_id) return;
    if (!event.text?.trim()) return;

    // Only handle DMs (channel type 'im')
    if (event.channel_type !== 'im') return;

    const person = resolve('slack', event.user);
    if (!person) {
      log.warn('Unknown Slack sender', { user: event.user });
      sendSlackMessage(event.channel, "Sorry, I don't recognize your Slack account. Ask a household admin to add your Slack user ID.");
      return;
    }

    log.info('Slack DM received', { from: person.display_name, length: event.text.length });
    handleSlackMessage(person, event.text.trim(), event.channel, event.thread_ts);
  });

  // Handle @mentions in channels
  app.event('app_mention', async ({ event }) => {
    if (event.bot_id) return;
    if (!event.text?.trim()) return;

    const person = resolve('slack', event.user);
    if (!person) {
      log.warn('Unknown Slack sender (mention)', { user: event.user });
      return;
    }

    // Strip the @mention from the message text
    const cleanText = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
    if (!cleanText) return;

    log.info('Slack @mention received', { from: person.display_name, channel: event.channel, length: cleanText.length });
    handleSlackChannelMessage(person, cleanText, event.channel, event.thread_ts || event.ts);
  });

  app.start().then(() => {
    log.info('Slack adapter started (Socket Mode)');
  }).catch((err) => {
    log.error('Slack adapter failed to start', { error: err.message });
  });
}
