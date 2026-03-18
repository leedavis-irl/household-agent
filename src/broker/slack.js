import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { resolve } from './identity.js';
import { think } from '../brain/index.js';
import { sendReply } from '../router/index.js';
import log from '../utils/logger.js';

const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;   // xapp-...
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;   // xoxb-...

let socketClient = null;
let webClient = null;
let botUserId = null;

// --- Public API for router ---

export function postMessage(channel, text, threadTs) {
  if (!webClient) {
    log.error('Slack send failed: web client not initialized');
    return false;
  }
  webClient.chat.postMessage({
    channel,
    text,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  }).catch((err) => {
    log.error('Slack postMessage failed', { channel, error: err.message });
  });
  return true;
}

// --- Message handling ---

function stripMention(text) {
  // Remove <@U...> bot mentions from the message text
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

async function handleMessage(event) {
  // Ignore bot messages, message_changed, etc.
  if (event.bot_id || event.subtype) return;
  // Ignore our own messages
  if (event.user === botUserId) return;

  const text = (event.text || '').trim();
  if (!text) return;

  const slackUserId = event.user;
  const channel = event.channel;
  const threadTs = event.thread_ts || event.ts;
  const channelType = event.channel_type; // 'im' for DMs, 'channel'/'group' for channels

  // Resolve Slack user to household member
  const person = resolve('slack', slackUserId);
  if (!person) {
    if (channelType === 'im') {
      log.warn('Unknown Slack sender', { slack_user: slackUserId });
      postMessage(channel, "Sorry, I don't recognize your Slack account. Ask a household admin to add your Slack ID to household.json.");
    }
    return;
  }

  const isDm = channelType === 'im';
  const isGroup = !isDm;

  // In channels, only respond when @mentioned
  if (isGroup) {
    const mentionPattern = new RegExp(`<@${botUserId}>`);
    if (!mentionPattern.test(event.text || '')) {
      return;
    }
  }

  const cleanText = stripMention(text);
  if (!cleanText) return;

  const dateKey = new Date().toISOString().slice(0, 10);
  const conversationId = isGroup
    ? `slack-${channel}-${dateKey}`
    : `${person.id}-slack-${dateKey}`;

  log.info('Slack message received', {
    from: person.display_name,
    channel,
    isDm,
    length: cleanText.length,
  });

  const msgEnvelope = {
    person_id: person.id,
    person: person.display_name,
    role: person.role,
    permissions: person.permissions,
    message: cleanText,
    source_channel: 'slack',
    reply_address: channel,
    group_id: isGroup ? channel : null,
    thread_ts: threadTs,
    conversation_id: conversationId,
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await think(msgEnvelope, (ack) => {
      if (ack != null && ack.trim() !== '') sendReply(msgEnvelope, ack);
    });
    if (response != null && response.trim() !== '') {
      sendReply(msgEnvelope, response);
    }
  } catch (err) {
    log.error('Brain error (Slack)', { error: err.message, from: person.display_name });
    postMessage(channel, 'Sorry, I hit an error processing that. Try again in a moment.', threadTs);
  }
}

// --- Lifecycle ---

export async function start() {
  if (!SLACK_APP_TOKEN || !SLACK_BOT_TOKEN) {
    log.warn('Slack tokens not configured, Slack channel disabled');
    return;
  }

  webClient = new WebClient(SLACK_BOT_TOKEN);

  // Get our own bot user ID so we can filter self-messages and detect mentions
  try {
    const authResult = await webClient.auth.test();
    botUserId = authResult.user_id;
    log.info('Slack bot identity', { bot_user_id: botUserId, team: authResult.team });
  } catch (err) {
    log.error('Slack auth.test failed', { error: err.message });
    return;
  }

  socketClient = new SocketModeClient({ appToken: SLACK_APP_TOKEN });

  socketClient.on('message', async ({ event, ack }) => {
    await ack();
    handleMessage(event);
  });

  socketClient.on('connected', () => {
    log.info('Slack Socket Mode connected');
  });

  socketClient.on('disconnected', () => {
    log.warn('Slack Socket Mode disconnected');
  });

  try {
    await socketClient.start();
    log.info('Slack broker started (Socket Mode)');
  } catch (err) {
    log.error('Slack Socket Mode start failed', { error: err.message });
  }
}
