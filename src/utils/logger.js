const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'];

function log(level, msg, data) {
  if (LEVELS[level] >= currentLevel) {
    const entry = { time: new Date().toISOString(), level, msg };
    if (data) entry.data = data;
    console.error(JSON.stringify(entry));
  }
}

export default {
  debug: (msg, data) => log('debug', msg, data),
  info: (msg, data) => log('info', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  error: (msg, data) => log('error', msg, data),
};
