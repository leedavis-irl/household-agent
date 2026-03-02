import { loadConfig } from '../src/utils/config.js';

// Load config before any test files import tool modules that call
// getHousehold() at module scope (e.g. calendar.js → getCalendarIds()).
loadConfig();
