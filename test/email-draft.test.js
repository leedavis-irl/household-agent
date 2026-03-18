import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { definition, execute } from '../src/tools/email-draft.js';

// Mock the google-oauth utility
vi.mock('../src/utils/google-oauth.js', () => ({
  hasToken: vi.fn(),
  getClient: vi.fn(),
}));

// Mock config utility
vi.mock('../src/utils/config.js', () => ({
  getHousehold: vi.fn(() => ({
    members: {
      lee: { display_name: 'Lee' },
      steve: { display_name: 'Steve' },
    },
  })),
}));

// Mock logger
vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const validEnvelope = {
  person_id: 'lee',
  person: 'lee',
  permissions: ['email_send'],
};

describe('email_draft tool definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('email_draft');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('requires to, subject, body params', () => {
    expect(definition.input_schema.required).toContain('to');
    expect(definition.input_schema.required).toContain('subject');
    expect(definition.input_schema.required).toContain('body');
  });

  it('has optional person param', () => {
    expect(definition.input_schema.properties.person).toBeDefined();
  });
});

describe('email_draft execute — validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns error when person cannot be resolved', async () => {
    const result = await execute(
      { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
      { person_id: '', person: '', permissions: ['email_send'] },
    );
    expect(result.error).toMatch(/Could not identify/);
  });

  it('returns error when requester lacks email_send permission', async () => {
    const result = await execute(
      { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
      { person_id: 'lee', person: 'lee', permissions: [] },
    );
    expect(result.error).toMatch(/Permission denied/);
  });

  it('returns error when trying to draft as another person', async () => {
    const result = await execute(
      { person: 'steve', to: 'a@b.com', subject: 'Hi', body: 'Hello' },
      { person_id: 'lee', person: 'lee', permissions: ['email_send'] },
    );
    expect(result.error).toMatch(/Permission denied/);
  });

  it('returns error when no Gmail token exists for person', async () => {
    const { hasToken } = await import('../src/utils/google-oauth.js');
    hasToken.mockReturnValue(false);

    const result = await execute(
      { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
      validEnvelope,
    );
    expect(result.error).toMatch(/Gmail/);
    expect(result.error).toMatch(/authorize/);
  });

  it('returns error for invalid recipient email', async () => {
    const { hasToken } = await import('../src/utils/google-oauth.js');
    hasToken.mockReturnValue(true);
    const { getClient } = await import('../src/utils/google-oauth.js');
    getClient.mockResolvedValue({});

    const result = await execute(
      { to: 'not-an-email', subject: 'Hi', body: 'Hello' },
      validEnvelope,
    );
    expect(result.error).toMatch(/Invalid recipient/);
  });
});

describe('email_draft execute — Gmail API', () => {
  let mockDraftsCreate;
  let mockGmail;

  beforeEach(async () => {
    vi.resetAllMocks();

    const { hasToken, getClient } = await import('../src/utils/google-oauth.js');
    hasToken.mockReturnValue(true);
    getClient.mockResolvedValue({});

    mockDraftsCreate = vi.fn().mockResolvedValue({
      data: { id: 'draft123' },
    });

    mockGmail = {
      users: {
        drafts: { create: mockDraftsCreate },
      },
    };

    vi.doMock('googleapis', () => ({
      google: {
        gmail: vi.fn().mockReturnValue(mockGmail),
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('googleapis');
  });

  it('returns draft ID and Gmail link on success', async () => {
    // Directly test the happy path by mocking the gmail call
    const { hasToken, getClient } = await import('../src/utils/google-oauth.js');
    hasToken.mockReturnValue(true);
    getClient.mockResolvedValue({ auth: 'mock-client' });

    // Mock googleapis inline
    const googleapis = await import('googleapis');
    const originalGoogle = googleapis.google;

    const draftId = 'r9876543210';
    googleapis.google = {
      gmail: vi.fn().mockReturnValue({
        users: {
          drafts: {
            create: vi.fn().mockResolvedValue({ data: { id: draftId } }),
          },
        },
      }),
    };

    const result = await execute(
      { to: 'teacher@school.edu', subject: 'IEP Meeting', body: 'Hello, I wanted to discuss...' },
      validEnvelope,
    );

    expect(result.drafted).toBe(true);
    expect(result.to).toBe('teacher@school.edu');
    expect(result.subject).toBe('IEP Meeting');
    expect(result.draftId).toBe(draftId);
    expect(result.gmailLink).toMatch(/mail\.google\.com/);
    expect(result.gmailLink).toContain(draftId);

    googleapis.google = originalGoogle;
  });

  it('returns expired-auth error on invalid_grant', async () => {
    const { hasToken, getClient } = await import('../src/utils/google-oauth.js');
    hasToken.mockReturnValue(true);
    getClient.mockRejectedValue(new Error('invalid_grant'));

    const result = await execute(
      { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
      validEnvelope,
    );
    expect(result.error).toMatch(/expired/i);
    expect(result.error).toMatch(/re-authorize/);
  });

  it('returns rate-limit error on 429', async () => {
    const { hasToken, getClient } = await import('../src/utils/google-oauth.js');
    hasToken.mockReturnValue(true);
    getClient.mockResolvedValue({});

    const googleapis = await import('googleapis');
    const originalGoogle = googleapis.google;

    const rateLimitErr = new Error('Too Many Requests');
    rateLimitErr.code = 429;
    googleapis.google = {
      gmail: vi.fn().mockReturnValue({
        users: {
          drafts: {
            create: vi.fn().mockRejectedValue(rateLimitErr),
          },
        },
      }),
    };

    const result = await execute(
      { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
      validEnvelope,
    );
    expect(result.error).toMatch(/rate-limiting/i);

    googleapis.google = originalGoogle;
  });
});
