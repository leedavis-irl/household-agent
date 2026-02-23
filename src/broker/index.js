import * as cli from './cli.js';
import * as signal from './signal.js';

export function startBroker() {
  const signalEnabled = process.env.SIGNAL_ENABLED !== 'false';

  if (signalEnabled) {
    signal.start();
  }

  cli.start();
}
