import { postMessage } from '../broker/slack.js';

export function send(text, replyAddress, groupId, threadTs) {
  postMessage(replyAddress, text, threadTs);
}
