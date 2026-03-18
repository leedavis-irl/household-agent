import log from '../utils/logger.js';

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

export const definition = {
  name: 'web_search',
  description:
    'Search the web for current information, news, product details, local business hours, or anything else requiring up-to-date knowledge beyond your training data. Returns titles, URLs, and descriptions for the top results.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query.',
      },
      count: {
        type: 'number',
        description: 'Number of results to return (1–10). Default: 5.',
      },
    },
    required: ['query'],
  },
};

export async function execute(input, _envelope) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return { error: 'Web search is not configured. BRAVE_SEARCH_API_KEY is missing.' };
  }

  const query = (input?.query || '').trim();
  if (!query) {
    return { error: 'query is required.' };
  }

  const count = Math.min(Math.max(1, Number(input?.count) || 5), 10);

  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brave Search API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const webResults = data?.web?.results || [];

    if (webResults.length === 0) {
      return { results: [], message: `No results found for: ${query}` };
    }

    const results = webResults.slice(0, count).map((r) => ({
      title: r.title || '',
      url: r.url || '',
      description: r.description || '',
    }));

    return { query, results };
  } catch (err) {
    log.error('Web search failed', { error: err.message, query });
    return { error: `Web search failed: ${err.message}` };
  }
}
