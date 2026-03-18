import * as cli from './cli.js';
import * as signal from './signal.js';
import * as slack from './slack.js';

export function startBroker() {
  const signalEnabled = process.env.SIGNAL_ENABLED !== 'false';
  const slackEnabled = process.env.SLACK_ENABLED !== 'false'
    && !!process.env.SLACK_APP_TOKEN
    && !!process.env.SLACK_BOT_TOKEN;

  if (signalEnabled) {
    signal.start();
  }

  if (slackEnabled) {
    slack.start();
  }

  cli.start();
}
