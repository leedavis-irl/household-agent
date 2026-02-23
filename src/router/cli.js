import log from '../utils/logger.js';

export function send(text) {
  log.info('Iji reply', { text });
}
