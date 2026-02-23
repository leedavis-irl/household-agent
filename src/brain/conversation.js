const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_MESSAGES = 20; // last N messages (count-based cap)

const conversations = new Map();

function trimToCap(msgs) {
  if (msgs.length <= MAX_MESSAGES) return msgs;
  return msgs.slice(-MAX_MESSAGES);
}

export function get(conversationId) {
  const entry = conversations.get(conversationId);
  if (!entry) return [];
  if (Date.now() - entry.lastAccess > TTL_MS) {
    conversations.delete(conversationId);
    return [];
  }
  entry.lastAccess = Date.now();
  return trimToCap(entry.messages);
}

export function append(conversationId, messages) {
  let entry = conversations.get(conversationId);
  if (!entry || Date.now() - entry.lastAccess > TTL_MS) {
    entry = { messages: [], lastAccess: Date.now() };
    conversations.set(conversationId, entry);
  }
  entry.messages.push(...messages);
  entry.messages = trimToCap(entry.messages);
  entry.lastAccess = Date.now();
}

export function clear(conversationId) {
  conversations.delete(conversationId);
}
