import { WebClient } from '@slack/web-api';
import log from '../utils/logger.js';

const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN;

function getClient() {
  if (!SLACK_USER_TOKEN) {
    return null;
  }
  return new WebClient(SLACK_USER_TOKEN);
}

export const definition = {
  name: 'slack_search',
  description:
    'Search Slack messages across all channels the bot has access to. Returns matching messages with channel, sender, timestamp, and text. Use for finding past conversations, decisions, or information shared in Slack.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query. Supports Slack search modifiers: in:#channel, from:@user, before:YYYY-MM-DD, after:YYYY-MM-DD, has:link, has:reaction.',
      },
      max_results: {
        type: 'number',
        description: 'Max messages to return (default 10, max 25).',
      },
      sort: {
        type: 'string',
        enum: ['score', 'timestamp'],
        description: 'Sort by relevance score (default) or timestamp.',
      },
    },
    required: ['query'],
  },
};

export async function execute(input, _envelope) {
  const client = getClient();
  if (!client) {
    return {
      error:
        'Slack search is not configured. A SLACK_USER_TOKEN (xoxp-...) with search:read scope is required.',
    };
  }

  const query = (input?.query || '').trim();
  if (!query) {
    return { error: 'A search query is required.' };
  }

  const maxResults = Math.min(25, Math.max(1, Number(input?.max_results) || 10));
  const sort = input?.sort === 'timestamp' ? 'timestamp' : 'score';
  const count = maxResults;

  try {
    const res = await client.search.messages({
      query,
      count,
      sort,
      sort_dir: sort === 'timestamp' ? 'desc' : 'desc',
    });

    const matches = res.messages?.matches ?? [];
    if (matches.length === 0) {
      return { message: 'No Slack messages found matching that search.', results: [] };
    }

    const results = matches.map((m) => ({
      channel: m.channel?.name ?? m.channel?.id ?? 'unknown',
      channel_id: m.channel?.id ?? '',
      user: m.username ?? m.user ?? 'unknown',
      timestamp: m.ts ? new Date(parseFloat(m.ts) * 1000).toISOString() : '',
      ts: m.ts ?? '',
      text: m.text ?? '',
      permalink: m.permalink ?? '',
    }));

    return {
      results,
      total: res.messages?.total ?? results.length,
      message: `Found ${results.length} message(s)${res.messages?.total > results.length ? ` (showing ${results.length} of ${res.messages.total})` : ''}.`,
    };
  } catch (err) {
    if (err.data?.error === 'not_authed' || err.data?.error === 'invalid_auth') {
      return {
        error:
          'Slack authentication failed. Check that SLACK_USER_TOKEN is a valid user token (xoxp-...) with search:read scope.',
      };
    }
    if (err.data?.error === 'missing_scope') {
      return {
        error:
          'Slack token is missing the search:read scope. Re-authorize the Slack app with search:read user scope.',
      };
    }
    if (err.data?.error === 'ratelimited') {
      return { error: 'Slack is rate-limiting search. Try again in a moment.' };
    }
    log.error('Slack search failed', { error: err.message, code: err.data?.error });
    return { error: `Slack search failed: ${err.message}` };
  }
}
