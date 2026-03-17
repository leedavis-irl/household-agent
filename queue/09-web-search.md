# Web search via OpenClaw / Brave Search

**Sphere:** Engine › Infrastructure
**Backlog item:** Web search capability
**Depends on:** none

## What to build

OpenClaw (running on the Mac Mini) has Brave Search configured. Rather than building a separate Brave Search integration on EC2, Iji should delegate web search requests to OpenClaw via the existing channel bridge. The pattern: when Iji on EC2 needs to search the web, it sends a structured request to OpenClaw, gets the result back, and incorporates it into its response.

If that bridge pattern is not yet feasible, the fallback is to add a direct Brave Search API tool to EC2 Iji using the Brave Search API. Check whether the OpenClaw bridge is viable first — if not, implement direct Brave Search on EC2.

## Read first

- `ARCHITECTURE.md` — the four-flow design
- `src/tools/ha-query.js` — pattern for a simple API-calling tool
- `config/household.json` — where API keys are referenced
- `.env.example` — to understand where to add a new key
- OpenClaw documentation if available on this machine

## Done when

**If OpenClaw bridge approach:**
- [ ] Iji can delegate search queries to OpenClaw and return results conversationally
- [ ] Works end-to-end via Signal DM: "search for the best Italian restaurants in Berkeley" returns real results

**If direct Brave Search approach:**
- [ ] `web_search` tool added to `src/tools/`
- [ ] Takes a `query` string, calls Brave Search API, returns top 3-5 results as title + snippet + URL
- [ ] `WEB_SEARCH_API_KEY` added to `.env.example`
- [ ] Tool registered and permission added (available to all adults)
- [ ] Works end-to-end via Signal DM

## Verify

Send Iji: "search for weather forecast for Berkeley this weekend" — should return real web results, not just the NWS weather tool output.

## Server requirements

- [ ] If direct Brave: `WEB_SEARCH_API_KEY` added to EC2 `.env` (Lee to add the key — get it from 1Password or create at search.brave.com)

## Commit message

`feat: web search capability via Brave Search`
