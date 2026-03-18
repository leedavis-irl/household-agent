import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../src/utils/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the example config for tests so test fixtures (alice, bob, carol, etc.)
// resolve correctly regardless of whether a real household.json is present.
loadConfig(join(__dirname, '../config/household.example.json'));
