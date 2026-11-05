// Feature flags for the Finance tab. Each external integration is optional and
// stays inert until the relevant env vars are present — mirrors the GOALS_ENABLED
// pattern in lib/goals.ts so the page renders cleanly with zero keys configured.

// CoinGecko's demo tier needs no key, so manual crypto pricing is always on.
// An optional key lifts rate limits when present.
export const COINGECKO_KEY = process.env.COINGECKO_API_KEY || '';
export const COINGECKO_ENABLED = true;

export const METALS_DEV_KEY = process.env.METALS_DEV_API_KEY || '';
export const METALS_ENABLED = !!METALS_DEV_KEY;

// AI insights via the Google Gemini API (free tier — gemini-3.1-flash-lite).
export const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
export const AI_ENABLED = !!GEMINI_KEY;
export const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

// Shared secret the business dashboard presents when writing the bridge doc.
export const BRIDGE_WRITE_TOKEN = process.env.BUSINESS_BRIDGE_TOKEN || '';
export const BRIDGE_WRITE_ENABLED = !!BRIDGE_WRITE_TOKEN;

// How long cached prices stay fresh before a refresh is attempted.
export const PRICE_TTL_MS = 20 * 60 * 1000; // 20 min
