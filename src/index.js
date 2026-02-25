import 'dotenv/config';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './utils/config.js';
import log from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

loadConfig();

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Monarch Money: health check on startup and every 6h; alert Lee on auth failure
if (process.env.MONARCH_EMAIL?.trim() && process.env.MONARCH_PASSWORD) {
  const { healthCheck, setAuthFailureNotifier } = await import('./utils/monarch.js');
  setAuthFailureNotifier(async (message) => {
    try {
      const { getHousehold } = await import('./utils/config.js');
      const { sendMessage } = await import('./broker/signal.js');
      const h = getHousehold();
      const lee = h?.members?.lee;
      if (lee?.identifiers?.signal) sendMessage(lee.identifiers.signal, message);
    } catch (e) {
      log.error('Monarch auth notifier failed', { error: e.message });
    }
  });
  const monarchHealth = await healthCheck();
  if (!monarchHealth.ok && !monarchHealth.skipped) {
    log.warn('Monarch health check failed on startup', { error: monarchHealth.error });
  }
  setInterval(() => healthCheck(), 6 * 60 * 60 * 1000);
}

const { startBroker } = await import('./broker/index.js');
startBroker();

const { startDailySummaryScheduler } = await import('./utils/usage-log.js');
startDailySummaryScheduler();

const { startReminderScheduler } = await import('./utils/reminder-scheduler.js');
startReminderScheduler();

const { startMorningBriefing } = await import('./utils/morning-briefing.js');
startMorningBriefing();
