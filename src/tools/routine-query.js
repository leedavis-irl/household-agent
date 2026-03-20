import log from '../utils/logger.js';

const TASK_TRACKER_URL = process.env.TASK_TRACKER_URL;

export const definition = {
  name: 'routine_query',
  description:
    "Query the Task Tracker for children's AM/PM routine completion status. Returns which tasks (teeth, laundry, plates, pills) are done and which are outstanding for each child. Can query all children or a specific child.",
  input_schema: {
    type: 'object',
    properties: {
      child: {
        type: 'string',
        description:
          'Optional: specific child name to query (e.g., "ryker", "logan"). If omitted, returns status for all children.',
      },
    },
  },
};

export async function execute(input, envelope) {
  if (!TASK_TRACKER_URL) {
    return { error: 'Task Tracker not configured — set TASK_TRACKER_URL in .env' };
  }

  try {
    const res = await fetch(`${TASK_TRACKER_URL}/state`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Task Tracker API error (${res.status}): ${text}`);
    }
    const state = await res.json();

    // Children can only see their own data
    const person = envelope?.person;
    const isChild = person?.role === 'child';
    const personName = person?.display_name?.toLowerCase();

    let result = state;

    if (isChild && personName) {
      // Filter to only this child's data
      if (typeof state === 'object' && state !== null) {
        const childKey = Object.keys(state).find((k) => k.toLowerCase() === personName);
        result = childKey ? { [childKey]: state[childKey] } : {};
      }
    } else if (input.child) {
      // Adult asking about a specific child
      const target = input.child.toLowerCase();
      if (typeof state === 'object' && state !== null) {
        const childKey = Object.keys(state).find((k) => k.toLowerCase() === target);
        result = childKey ? { [childKey]: state[childKey] } : {};
      }
    }

    return { routines: result };
  } catch (err) {
    log.error('Routine query failed', { error: err.message });
    return { error: `Routine query failed: ${err.message}` };
  }
}
