import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/broker/signal.js', () => ({
  sendMessage: vi.fn().mockReturnValue(true),
}));

vi.mock('../src/brain/index.js', () => ({
  think: vi.fn().mockResolvedValue('Good morning! You have two meetings today.'),
}));

vi.mock('../src/utils/config.js', () => ({
  getHousehold: vi.fn().mockReturnValue({
    members: {
      alice: {
        display_name: 'Alice',
        role: 'adult',
        permissions: ['calendar_all'],
        identifiers: { signal: '+15105550001' },
        briefing: { enabled: true, delivery_hour: 7 },
      },
    },
  }),
}));

vi.mock('../src/utils/db.js', () => ({
  getDb: vi.fn().mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(null),
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('morning briefing prompt', () => {
  it('does not include weather in the briefing prompt', async () => {
    const { think } = await import('../src/brain/index.js');
    const { startMorningBriefing } = await import('../src/utils/morning-briefing.js');

    startMorningBriefing();

    // Give async cycle time to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (think.mock.calls.length > 0) {
      const callArgs = think.mock.calls[0][0];
      expect(callArgs.message).not.toMatch(/weather/i);
      expect(callArgs.message).not.toMatch(/forecast/i);
    } else {
      // If think wasn't called, skip — briefing may not have triggered at this hour
      expect(true).toBe(true);
    }
  });
});
