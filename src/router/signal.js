import { sendMessage, sendGroupMessage } from '../broker/signal.js';

export function send(text, replyAddress, groupId) {
  if (groupId) {
    sendGroupMessage(groupId, text);
  } else {
    sendMessage(replyAddress, text);
  }
}
