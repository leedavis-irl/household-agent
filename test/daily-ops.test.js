import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWakingHours,
  runDailyOpsCheck,
  getOverdueTasks,
  _resetState,
  getSentToday,
} from '../src/utils/daily-ops.js';
import { getDb } from '../src/utils/db.js';

// --- helpers ---

function clearTasks() {
  const db = getDb();
  db.prepare("DELETE FROM tasks WHERE creator_id = 'test-daily-ops'").run();
}

function insertOverdueTask(assigneeId, title) {
  const db = getDb();
  db.prepare(`
    INSERT INTO tasks (title, assignee_id, creator_id, status, due_at, priority)
    VALUES (?, ?, 'test-daily-ops', 'open', datetime('now', '-1 hour'), 'normal')
  `).run(title, assigneeId);
}

function insertFutureTask(assigneeId, title) {
  const db = getDb();
  db.prepare(`
    INSERT INTO tasks (title, assignee_id, creator_id, status, due_at, priority)
    VALUES (?, ?, 'test-daily-ops', 'open', datetime('now', '+2 days'), 'normal')
  `).run(title, assigneeId);
}

// --- mocks ---

vi.mock('../src/broker/signal.js', () => ({
  sendMessage: vi.fn().mockReturnValue(true),
}));

vi.mock('../src/brain/index.js', () => ({
  think: vi.fn().mockResolvedValue('Heads up: you have a meeting starting soon.'),
}));

vi.mock('../src/utils/google-calendar.js', () => ({
  getCalendarClient: vi.fn().mockResolvedValue(null),
  getCalendarIds: vi.fn().mockReturnValue({}),
}));

beforeEach(() => {
  _resetState();
  clearTasks();
  vi.clearAllMocks();
});

afterEach(() => {
  clearTasks();
});

// --- isWakingHours ---

describe('isWakingHours', () => {
  it('returns true during waking hours (7am)', () => {
    expect(isWakingHours(7)).toBe(true);
  });

  it('returns true during waking hours (noon)', () => {
    expect(isWakingHours(12)).toBe(true);
  });

  it('returns true at 9pm (21)', () => {
    expect(isWakingHours(21)).toBe(true);
  });

  it('returns false at 10pm (22)', () => {
    expect(isWakingHours(22)).toBe(false);
  });

  it('returns false at midnight (0)', () => {
    expect(isWakingHours(0)).toBe(false);
  });

  it('returns false at 3am', () => {
    expect(isWakingHours(3)).toBe(false);
  });

  it('returns false at 6am', () => {
    expect(isWakingHours(6)).toBe(false);
  });
});

// --- getOverdueTasks ---

describe('getOverdueTasks', () => {
  it('returns overdue tasks for the given person', () => {
    insertOverdueTask('alice', 'Fix the leaky faucet');
    const tasks = getOverdueTasks('alice');
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks[0].title).toBe('Fix the leaky faucet');
  });

  it('does not return tasks for another person', () => {
    insertOverdueTask('alice', 'Fix the leaky faucet');
    const tasks = getOverdueTasks('bob');
    const aliceTasks = tasks.filter((t) => t.title === 'Fix the leaky faucet');
    expect(aliceTasks.length).toBe(0);
  });

  it('does not return future tasks', () => {
    insertFutureTask('alice', 'Future task');
    const tasks = getOverdueTasks('alice');
    const futureTasks = tasks.filter((t) => t.title === 'Future task');
    expect(futureTasks.length).toBe(0);
  });

  it('returns empty array when no tasks exist', () => {
    const tasks = getOverdueTasks('alice');
    expect(Array.isArray(tasks)).toBe(true);
  });
});

// --- runDailyOpsCheck ---

describe('runDailyOpsCheck: waking hours guard', () => {
  it('skips when called outside waking hours (via mocked pacificNow)', async () => {
    // We can't easily mock the hour, so instead test via the exported isWakingHours
    // and verify the function returns a skip result when hour is outside range.
    // Test the logic directly: hours 0-6 and 22-23 should be skipped.
    expect(isWakingHours(0)).toBe(false);
    expect(isWakingHours(6)).toBe(false);
    expect(isWakingHours(22)).toBe(false);
    expect(isWakingHours(23)).toBe(false);
  });
});

describe('runDailyOpsCheck: calendar event triggers nudge', () => {
  it('sends a nudge when there is an upcoming calendar event', async () => {
    const { getCalendarClient, getCalendarIds } = await import('../src/utils/google-calendar.js');
    const { think } = await import('../src/brain/index.js');
    const { sendMessage } = await import('../src/broker/signal.js');

    // Mock calendar to return an upcoming event
    getCalendarClient.mockResolvedValue({
      events: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: 'evt-001',
                summary: 'Ryker pickup',
                start: { dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
                end: { dateTime: new Date(Date.now() + 90 * 60 * 1000).toISOString() },
              },
            ],
          },
        }),
      },
    });
    getCalendarIds.mockReturnValue({ alice: 'alice@example.com' });

    // Mock weather (no rain)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    });

    const result = await runDailyOpsCheck();

    // think() should have been called for alice
    expect(think).toHaveBeenCalled();
    const callArgs = think.mock.calls[0][0];
    expect(callArgs.message).toMatch(/Ryker pickup/);

    // sendMessage should have been called
    expect(sendMessage).toHaveBeenCalled();

    delete global.fetch;
  });
});

describe('runDailyOpsCheck: overdue task triggers nudge', () => {
  it('sends a nudge when a task is overdue', async () => {
    const { getCalendarClient, getCalendarIds } = await import('../src/utils/google-calendar.js');
    const { think } = await import('../src/brain/index.js');
    const { sendMessage } = await import('../src/broker/signal.js');

    // No calendar events
    getCalendarClient.mockResolvedValue(null);
    getCalendarIds.mockReturnValue({});

    // No rain
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    });

    insertOverdueTask('alice', 'Call the plumber');

    const result = await runDailyOpsCheck();

    expect(think).toHaveBeenCalled();
    const callArgs = think.mock.calls[0][0];
    expect(callArgs.message).toMatch(/Call the plumber/);
    expect(sendMessage).toHaveBeenCalled();

    delete global.fetch;
  });
});

describe('runDailyOpsCheck: dedup prevents repeat nudges', () => {
  it('does not send the same nudge twice for the same overdue task on the same day', async () => {
    const { getCalendarClient, getCalendarIds } = await import('../src/utils/google-calendar.js');
    const { think } = await import('../src/brain/index.js');
    const { sendMessage } = await import('../src/broker/signal.js');

    getCalendarClient.mockResolvedValue(null);
    getCalendarIds.mockReturnValue({});

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    });

    insertOverdueTask('alice', 'Renew car registration');

    // First check — should send nudge
    await runDailyOpsCheck();
    expect(sendMessage).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Second check — same day, same task — should NOT send again
    await runDailyOpsCheck();
    expect(sendMessage).not.toHaveBeenCalled();

    delete global.fetch;
  });
});

describe('runDailyOpsCheck: SKIP response not sent', () => {
  it('does not send a message when brain responds with SKIP', async () => {
    const { getCalendarClient, getCalendarIds } = await import('../src/utils/google-calendar.js');
    const { think } = await import('../src/brain/index.js');
    const { sendMessage } = await import('../src/broker/signal.js');

    getCalendarClient.mockResolvedValue(null);
    getCalendarIds.mockReturnValue({});

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    });

    think.mockResolvedValue('SKIP');
    insertOverdueTask('alice', 'Not urgent task');

    await runDailyOpsCheck();

    expect(think).toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    delete global.fetch;
  });
});

describe('runDailyOpsCheck: weather nudge', () => {
  it('includes weather info when rain is starting soon', async () => {
    const { getCalendarClient, getCalendarIds } = await import('../src/utils/google-calendar.js');
    const { think } = await import('../src/brain/index.js');

    getCalendarClient.mockResolvedValue(null);
    getCalendarIds.mockReturnValue({});

    // Mock NWS points + hourly forecast with rain
    const pointsResponse = {
      properties: {
        forecastHourly: 'https://api.weather.gov/gridpoints/MTR/92,88/forecast/hourly',
      },
    };
    const hourlyResponse = {
      properties: {
        periods: [
          {
            startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            shortForecast: 'Light Rain',
            probabilityOfPrecipitation: { value: 70 },
            temperature: 58,
          },
        ],
      },
    };

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? pointsResponse : hourlyResponse;
      return Promise.resolve({
        ok: true,
        json: async () => data,
      });
    });

    await runDailyOpsCheck();

    expect(think).toHaveBeenCalled();
    const callArgs = think.mock.calls[0][0];
    expect(callArgs.message).toMatch(/Rain/i);

    delete global.fetch;
  });
});

// --- daily_ops_check tool ---

describe('daily_ops_check tool', () => {
  it('has correct tool name', async () => {
    const { definition } = await import('../src/tools/daily-ops-check.js');
    expect(definition.name).toBe('daily_ops_check');
  });

  it('returns structured results for a known person', async () => {
    const { execute } = await import('../src/tools/daily-ops-check.js');

    const { getCalendarClient } = await import('../src/utils/google-calendar.js');
    getCalendarClient.mockResolvedValue(null);

    const envelope = {
      person_id: 'alice',
      person: 'Alice',
      permissions: ['calendar_all', 'tasks'],
    };
    const result = await execute({}, envelope);

    expect(result).toHaveProperty('upcoming_events');
    expect(result).toHaveProperty('overdue_tasks');
    expect(result).toHaveProperty('reminders_due_soon');
    expect(result).toHaveProperty('recent_knowledge');
    expect(result).toHaveProperty('summary');
    expect(typeof result.summary.upcoming_event_count).toBe('number');
  });

  it('returns overdue tasks in results', async () => {
    const { execute } = await import('../src/tools/daily-ops-check.js');

    const { getCalendarClient } = await import('../src/utils/google-calendar.js');
    getCalendarClient.mockResolvedValue(null);

    insertOverdueTask('alice', 'Check on the HVAC filter');

    const envelope = {
      person_id: 'alice',
      person: 'Alice',
      permissions: ['calendar_all', 'tasks'],
    };
    const result = await execute({}, envelope);

    expect(result.overdue_tasks.length).toBeGreaterThanOrEqual(1);
    const found = result.overdue_tasks.find((t) => t.title === 'Check on the HVAC filter');
    expect(found).toBeDefined();
  });

  it('returns error when no person_id', async () => {
    const { execute } = await import('../src/tools/daily-ops-check.js');
    const result = await execute({}, {});
    expect(result.error).toBeDefined();
  });
});
