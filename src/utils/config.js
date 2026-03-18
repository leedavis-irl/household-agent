import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const primaryPath = join(__dirname, '../../config/household.json');
const examplePath = join(__dirname, '../../config/household.example.json');
const configPath = existsSync(primaryPath) ? primaryPath : examplePath;

let household = null;

/**
 * Load and validate config. Call once at startup. Throws if invalid or missing.
 */
export function loadConfig() {
  if (!existsSync(configPath)) {
    throw new Error(`Missing config: ${configPath}`);
  }

  const raw = readFileSync(configPath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid household.json: ${err.message}`);
  }

  if (!data.members || typeof data.members !== 'object') {
    throw new Error('household.json must have "members" object');
  }
  if (!data.permission_definitions || typeof data.permission_definitions !== 'object') {
    throw new Error('household.json must have "permission_definitions" object');
  }

  household = data;
  return household;
}

export function getHousehold() {
  if (!household) {
    throw new Error('Config not loaded — call loadConfig() at startup');
  }
  return household;
}
