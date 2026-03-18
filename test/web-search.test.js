import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { definition, execute } from '../src/tools/web-search.js';

describe('web_search tool definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('web_search');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('requires query param', () => {
    expect(definition.input_schema.required).toContain('query');
  });

  it('has optional count param', () => {
    expect(definition.input_schema.properties.count).toBeDefined();
    expect(definition.input_schema.properties.count.type).toBe('number');
  });
});

describe('web_search execute', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.BRAVE_SEARCH_API_KEY;

  beforeEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.BRAVE_SEARCH_API_KEY;
    } else {
      process.env.BRAVE_SEARCH_API_KEY = originalEnv;
    }
    vi.restoreAllMocks();
  });

  it('returns error when BRAVE_SEARCH_API_KEY is missing', async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const result = await execute({ query: 'test' });
    expect(result.error).toMatch(/BRAVE_SEARCH_API_KEY/);
  });

  it('returns error when query is empty', async () => {
    const result = await execute({ query: '' });
    expect(result.error).toMatch(/query/i);
  });

  it('returns error when query is missing', async () => {
    const result = await execute({});
    expect(result.error).toMatch(/query/i);
  });

  it('returns formatted results on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'Result 1', url: 'https://example.com/1', description: 'Desc 1' },
            { title: 'Result 2', url: 'https://example.com/2', description: 'Desc 2' },
          ],
        },
      }),
    });

    const result = await execute({ query: 'best coffee shops berkeley', count: 2 });
    expect(result.query).toBe('best coffee shops berkeley');
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: 'Result 1',
      url: 'https://example.com/1',
      description: 'Desc 1',
    });
  });

  it('passes correct headers to Brave API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    await execute({ query: 'test query' });

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('api.search.brave.com');
    expect(url).toContain('q=test+query');
    expect(options.headers['X-Subscription-Token']).toBe('test-api-key');
    expect(options.headers['Accept']).toBe('application/json');
  });

  it('clamps count to 1-10 range', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    await execute({ query: 'test', count: 50 });
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('count=10');
  });

  it('defaults count to 5 when not specified', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    await execute({ query: 'test' });
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('count=5');
  });

  it('returns message when no results found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    const result = await execute({ query: 'xyzzy-nonexistent-term-12345' });
    expect(result.results).toEqual([]);
    expect(result.message).toMatch(/No results/i);
  });

  it('returns error on API failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    const result = await execute({ query: 'test' });
    expect(result.error).toMatch(/Brave Search API error/);
    expect(result.error).toContain('429');
  });

  it('returns error on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await execute({ query: 'test' });
    expect(result.error).toMatch(/Web search failed/);
    expect(result.error).toMatch(/Network error/);
  });
});
