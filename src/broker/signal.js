import { spawn } from 'child_process';
import { createConnection } from 'net';
import { existsSync, appendFileSync } from 'fs';
import { resolve } from './identity.js';
import { sendReply } from '../router/index.js';
import { think } from '../brain/index.js';
import { execute as storeKnowledge } from '../tools/knowledge-store.js';
import { registerGroup } from '../utils/signal-groups.js';
import log from '../utils/logger.js';

const SIGNAL_CLI = process.env.SIGNAL_CLI_PATH || '/opt/homebrew/bin/signal-cli';
const SIGNAL_ACCOUNT = process.env.SIGNAL_ACCOUNT || '+17074748930';
const TCP_HOST = '127.0.0.1';
const TCP_PORT = 7583;
const RESTART_DELAY_MS = 5000;
const CONNECT_RETRY_MS = 2000;
const MAX_CONNECT_RETRIES = 10;

const IJI_TRIGGER = /\biji\b/i;

let signalProcess = null;
let tcpClient = null;
let rpcId = 1;
let shuttingDown = false;

// --- TCP Client for JSON-RPC ---

function connectTcp(retries = 0) {
  if (shuttingDown) return;

  tcpClient = createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
    log.info('Connected to signal-cli JSON-RPC', { host: TCP_HOST, port: TCP_PORT });
  });

  let buffer = '';

  tcpClient.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) handleJsonRpc(line.trim());
    }
  });

  tcpClient.on('error', (err) => {
    if (shuttingDown) return;
    log.debug('signal-cli TCP error', { error: err.message });
  });

  tcpClient.on('close', () => {
    if (shuttingDown) return;
    tcpClient = null;
    if (retries < MAX_CONNECT_RETRIES) {
      log.info(`Reconnecting to signal-cli TCP (attempt ${retries + 1})...`);
      setTimeout(() => connectTcp(retries + 1), CONNECT_RETRY_MS);
    } else {
      log.error('Failed to connect to signal-cli TCP after max retries');
    }
  });
}

function sendRpc(method, params) {
  if (!tcpClient || tcpClient.destroyed) {
    log.error('TCP client not available, cannot send');
    return;
  }
  const request = { jsonrpc: '2.0', method, params, id: rpcId++ };
  tcpClient.write(JSON.stringify(request) + '\n');
}

// --- Public send functions ---

const DEBUG_SIGNAL = process.env.DEBUG_SIGNAL === 'true';

function debugLog(line) {
  if (DEBUG_SIGNAL) {
    try { appendFileSync('/tmp/iji-signal-debug.log', new Date().toISOString() + ' ' + line + '\n'); } catch {}
  }
}

export function sendMessage(recipient, text) {
  debugLog('OUTGOING DM to=' + recipient + ' len=' + text.length);
  log.info('Sending Signal DM', { recipient, length: text.length });
  sendRpc('send', { recipient: [recipient], message: text });
}

export function sendGroupMessage(groupId, text) {
  debugLog('OUTGOING GROUP to=' + groupId + ' len=' + text.length);
  log.info('Sending Signal group message', { groupId, length: text.length });
  sendRpc('send', { groupId, message: text });
}

// --- Handle incoming JSON-RPC messages ---

function handleJsonRpc(line) {
  debugLog(line);

  let data;
  try {
    data = JSON.parse(line);
  } catch {
    log.info('Signal non-JSON line', { line: line.slice(0, 200) });
    return;
  }

  if (data.id && data.result !== undefined) return;
  if (data.id && data.error !== undefined) {
    log.warn('Signal RPC error', { id: data.id, error: data.error });
    return;
  }

  const envelope = data.params?.envelope || data.envelope;
  if (!envelope) return;

  const dataMessage = envelope.dataMessage;
  if (!dataMessage || !dataMessage.message) return;

  log.debug('Raw dataMessage keys', { keys: Object.keys(dataMessage), raw: JSON.stringify(dataMessage).slice(0, 500) });

  const senderNumber = envelope.sourceNumber || null;
  const senderUuid = envelope.sourceUuid || envelope.source;
  const senderId = senderNumber || senderUuid;
  if (!senderId) return;

  // Skip messages from ourselves
  if (senderNumber === SIGNAL_ACCOUNT) return;

  const messageText = dataMessage.message.trim();
  if (!messageText) return;

  // Detect group messages — signal-cli uses different field names depending on version
  const groupInfo = dataMessage.groupInfo || dataMessage.group || dataMessage.groupV2;
  const groupId = groupInfo?.groupId || groupInfo?.id || null;
  const isGroup = !!groupId;

  if (isGroup && groupId) {
    const groupName = groupInfo?.name ?? groupInfo?.title ?? groupInfo?.groupName ?? 'Unknown group';
    registerGroup(groupId, groupName);
  }

  log.debug('Signal message parsed', {
    sender: senderId,
    senderNumber,
    senderUuid,
    isGroup,
    groupId: groupId ? groupId.slice(0, 12) + '...' : null,
    groupFields: Object.keys(dataMessage).filter(k => k.toLowerCase().includes('group')),
  });

  // Try resolving by phone number first, then by UUID
  const person = (senderNumber && resolve('signal', senderNumber)) || resolve('signal_uuid', senderUuid);
  if (!person) {
    if (!isGroup) {
      log.warn('Unknown Signal sender', { number: senderNumber, uuid: senderUuid });
      if (senderNumber) sendMessage(senderNumber, "Sorry, I don't recognize your number. Ask a household admin to add you.");
    }
    return;
  }

  log.info('Signal message received', {
    from: person.display_name,
    group: isGroup,
    length: messageText.length,
  });

  const replyNumber = person.identifiers?.signal || senderNumber || senderUuid;

  if (isGroup) {
    handleGroupMessage(person, messageText, groupId, dataMessage.mentions);
  } else {
    handleDirectMessage(person, messageText, replyNumber);
  }
}

// --- Group message handling ---

// Iji's Signal UUID (from signal-cli account registration)
const IJI_UUID = '9a97ab4d-ca8b-43f3-8234-6dbac5a7ba74';

function isMentioned(mentions) {
  if (!Array.isArray(mentions)) return false;
  return mentions.some(m => m.uuid === IJI_UUID);
}

function handleGroupMessage(person, messageText, groupId, mentions) {
  // Debug: log the raw mentions data so we can see signal-cli's format
  log.info('Group message mentions check', { from: person.display_name, mentions: JSON.stringify(mentions), ijiUuid: IJI_UUID, textHasIji: IJI_TRIGGER.test(messageText) });

  // Only respond when @mentioned
  if (!isMentioned(mentions)) {
    log.debug('Group message ignored (no @mention)', { from: person.display_name });
    return;
  }

  // Conversation context is shared per group per day.
  const dateKey = new Date().toISOString().slice(0, 10);
  const conversationId = `group-${groupId}-${dateKey}`;

  const msgEnvelope = {
    person_id: person.id,
    person: person.display_name,
    role: person.role,
    permissions: person.permissions,
    message: messageText,
    source_channel: 'signal',
    reply_address: groupId,
    group_id: groupId,
    conversation_id: conversationId,
    timestamp: new Date().toISOString(),
  };

  log.info('Group message to brain', { from: person.display_name, groupId: groupId?.slice(0, 12) + '...' });

  think(msgEnvelope, (ack) => {
    if (ack != null && ack.trim() !== '') sendReply(msgEnvelope, ack);
  })
    .then((response) => {
      if (response != null && response.trim() !== '') sendReply(msgEnvelope, response);
    })
    .catch((err) => {
      log.error('Brain error (Signal group)', { error: err.message, from: person.display_name });
      sendGroupMessage(groupId, 'Sorry, I hit an error processing that. Try again in a moment.');
    });
}

// --- Passive knowledge absorption ---

async function absorbGroupMessage(person, messageText) {
  // Skip very short messages, reactions, emoji-only, etc.
  if (messageText.length < 10) return;
  // Skip messages that are clearly conversational and not informational
  if (/^(lol|haha|ok|yeah|yep|nope|sure|thanks|thx|ty|np|k|omg|wow|nice|cool)\b/i.test(messageText)) return;

  try {
    const fakeEnvelope = { person: person.display_name };
    await storeKnowledge(
      {
        content: `[Group message from ${person.display_name}]: ${messageText}`,
        tags: ['group-signal', 'passive'],
      },
      fakeEnvelope
    );
    log.debug('Absorbed group message', { from: person.display_name, length: messageText.length });
  } catch (err) {
    log.debug('Failed to absorb group message', { error: err.message });
  }
}

// --- Direct message handling ---

function handleDirectMessage(person, messageText, replyAddress) {
  const conversationId = `${person.id}-signal-${new Date().toISOString().slice(0, 10)}`;

  const msgEnvelope = {
    person_id: person.id,
    person: person.display_name,
    role: person.role,
    permissions: person.permissions,
    message: messageText,
    source_channel: 'signal',
    reply_address: replyAddress,
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
      log.error('Brain error (Signal)', { error: err.message, from: person.display_name });
      if (replyAddress) sendMessage(replyAddress, 'Sorry, I hit an error processing that. Try again in a moment.');
    });
}

// --- Daemon lifecycle ---

function spawnDaemon() {
  log.info('Starting signal-cli daemon', { account: SIGNAL_ACCOUNT });

  signalProcess = spawn(SIGNAL_CLI, [
    '-a', SIGNAL_ACCOUNT,
    'daemon',
    '--tcp', `${TCP_HOST}:${TCP_PORT}`,
    '--no-receive-stdout',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  signalProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) log.debug('signal-cli stdout', { text: text.slice(0, 300) });
  });

  signalProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) log.debug('signal-cli stderr', { text: text.slice(0, 300) });
  });

  signalProcess.on('error', (err) => {
    if (err.code === 'ENOENT') {
      log.warn('signal-cli binary not found, Signal channel disabled', { path: SIGNAL_CLI });
      signalProcess = null;
      return;
    }
    log.error('signal-cli process error', { error: err.message });
  });

  signalProcess.on('exit', (code, signal) => {
    log.warn('signal-cli daemon exited', { code, signal });
    signalProcess = null;
    if (tcpClient) {
      tcpClient.destroy();
      tcpClient = null;
    }
    if (!shuttingDown) {
      log.info(`Restarting signal-cli in ${RESTART_DELAY_MS / 1000}s...`);
      setTimeout(spawnDaemon, RESTART_DELAY_MS);
    }
  });

  setTimeout(() => connectTcp(), 2000);
}

export function start() {
  if (!existsSync(SIGNAL_CLI)) {
    log.warn('signal-cli not found, Signal channel disabled', { path: SIGNAL_CLI });
    return;
  }

  spawnDaemon();

  const shutdown = () => {
    shuttingDown = true;
    if (tcpClient) {
      tcpClient.destroy();
      tcpClient = null;
    }
    if (signalProcess) {
      log.info('Shutting down signal-cli daemon');
      signalProcess.kill('SIGTERM');
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
