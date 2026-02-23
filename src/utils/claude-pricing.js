/**
 * Configurable per-model pricing for Claude API (USD per 1M tokens).
 * Update these when Anthropic changes prices.
 * @see https://www.anthropic.com/pricing
 */
const PRICING = {
  'claude-sonnet-4-20250514': { inputPerM: 3, outputPerM: 15 },
  'claude-3-5-sonnet-20241022-v2': { inputPerM: 3, outputPerM: 15 },
  'claude-3-5-haiku-20241022-v2': { inputPerM: 0.8, outputPerM: 4 },
  'claude-3-opus-20240229': { inputPerM: 15, outputPerM: 75 },
  'claude-3-sonnet-20240229': { inputPerM: 3, outputPerM: 15 },
  'claude-3-haiku-20240307': { inputPerM: 0.25, outputPerM: 1.25 },
};

/**
 * Estimate cost in USD for a single API call.
 * Falls back to Sonnet-like pricing if model is unknown.
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const inT = Number(inputTokens) || 0;
  const outT = Number(outputTokens) || 0;
  const p = PRICING[model] || PRICING['claude-sonnet-4-20250514'];
  const cost = (inT / 1e6) * p.inputPerM + (outT / 1e6) * p.outputPerM;
  return Math.round(cost * 1e6) / 1e6;
}

export function getPricing(model) {
  return PRICING[model] || PRICING['claude-sonnet-4-20250514'];
}
