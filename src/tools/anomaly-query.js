import { runAnomalyCheck, getRecentAnomalies } from '../utils/anomaly-detector.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'anomaly_query',
  description:
    'Check for anomalous sensor readings at home — unusual door openings, water leaks, temperature spikes. Use action="check_now" to run an immediate live check against HA sensors, or action="recent" to see anomalies detected in this session.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['check_now', 'recent'],
        description:
          'check_now: run an immediate anomaly check against live HA sensors and return results; recent: return anomalies detected during this session',
      },
    },
    required: ['action'],
  },
};

export async function execute(input) {
  if (input.action === 'check_now') {
    try {
      const result = await runAnomalyCheck();
      if (result.skipped) {
        return { message: 'Anomaly check skipped: Home Assistant not configured.' };
      }
      if (result.error) {
        return { error: `Anomaly check failed: ${result.error}` };
      }
      if (result.anomalies.length === 0) {
        return {
          message: 'All clear — no anomalies detected.',
          checked: result.checked,
        };
      }
      return {
        anomalies: result.anomalies,
        count: result.anomalies.length,
        message: `${result.anomalies.length} anomal${result.anomalies.length === 1 ? 'y' : 'ies'} detected.`,
      };
    } catch (err) {
      log.error('anomaly_query check_now failed', { error: err.message });
      return { error: `Anomaly check failed: ${err.message}` };
    }
  }

  if (input.action === 'recent') {
    const recent = getRecentAnomalies();
    if (recent.length === 0) {
      return { message: 'No anomalies detected in this session.' };
    }
    return {
      anomalies: recent,
      count: recent.length,
    };
  }

  return { error: `Unknown action: ${input.action}. Use check_now or recent.` };
}
