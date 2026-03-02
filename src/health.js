import { createServer } from 'http';
import { getDb } from './utils/db.js';
import log from './utils/logger.js';

const PORT = parseInt(process.env.HEALTH_PORT || '3001', 10);

export function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404);
      res.end();
      return;
    }

    const checks = {};
    let ok = true;

    // DB reachable
    try {
      const db = getDb();
      const row = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get();
      checks.db = { ok: true, tables: row.n };
    } catch (err) {
      checks.db = { ok: false, error: err.message };
      ok = false;
    }

    // Anthropic key present
    if (process.env.ANTHROPIC_API_KEY?.trim()) {
      checks.anthropic_key = { ok: true };
    } else {
      checks.anthropic_key = { ok: false, error: 'missing' };
      ok = false;
    }

    const status = ok ? 200 : 503;
    const body = JSON.stringify({ ok, uptime_s: Math.floor(process.uptime()), checks });

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  });

  server.listen(PORT, '127.0.0.1', () => {
    log.info('Health server listening', { port: PORT });
  });
}
