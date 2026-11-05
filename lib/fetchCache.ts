'use client';
// Lightweight client-side data cache with stale-while-revalidate.
//
// - Module-level Map: survives client-side navigation, resets on hard reload.
//   Nothing is persisted to disk/localStorage, so the browser footprint stays tiny.
// - peekCache(): synchronous read of the last known value (ignores TTL) so a page
//   can paint instantly on re-navigation instead of flashing an empty state.
// - useCachedFetch(): SWR hook — paints cached data immediately, then revalidates
//   in the background and swaps in fresh values when the network resolves.
// - In-flight de-duplication: concurrent requests for the same URL share one fetch.
// - Bounded size (LRU-ish) so the Map can't grow without limit.
import { useCallback, useEffect, useState } from 'react';

type Entry = { data: unknown; at: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 60;

function setEntry(url: string, data: unknown) {
  store.delete(url); // re-insert to move to the end (most-recently-used)
  store.set(url, { data, at: Date.now() });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

/** Synchronous read of the last cached value (ignores TTL). Undefined if never fetched. */
export function peekCache<T>(url: string): T | undefined {
  return store.get(url)?.data as T | undefined;
}

async function doFetch<T>(url: string): Promise<T> {
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;
  const promise = (async () => {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw Object.assign(new Error(`HTTP ${r.status}: ${text.slice(0, 120)}`), { status: r.status });
    }
    const data = (await r.json()) as T;
    setEntry(url, data);
    return data;
  })();
  inflight.set(url, promise);
  try {
    return (await promise) as T;
  } finally {
    inflight.delete(url);
  }
}

/** Returns cached data if still within ttl, otherwise fetches (de-duped). */
export async function fetchCached<T>(url: string, ttl = 60_000): Promise<T> {
  const hit = store.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  return doFetch<T>(url);
}

// Call before a reload that follows a mutation to get fresh data.
export function bustCache(urlPrefix: string) {
  for (const k of [...store.keys()]) if (k.startsWith(urlPrefix)) store.delete(k);
}

type CachedFetchResult<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  /** Force a fresh fetch, bypassing the TTL. */
  refresh: () => Promise<void>;
};

/**
 * Stale-while-revalidate fetch hook.
 * Paints the cached value immediately (no empty flash on re-navigation), then
 * revalidates in the background. Pass `null` as url to disable.
 */
export function useCachedFetch<T>(url: string | null, ttl = 60_000): CachedFetchResult<T> {
  const [data, setData] = useState<T | undefined>(() => (url ? peekCache<T>(url) : undefined));
  const [loading, setLoading] = useState<boolean>(() => (url ? peekCache<T>(url) === undefined : false));
  const [error, setError] = useState<Error | null>(null);

  const revalidate = useCallback(
    async (force: boolean) => {
      if (!url) return;
      try {
        const fresh = force ? await doFetch<T>(url) : await fetchCached<T>(url, ttl);
        setData(fresh);
        setError(null);
      } catch (e) {
        setError(e as Error);
      } finally {
        setLoading(false);
      }
    },
    [url, ttl],
  );

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const cached = peekCache<T>(url);
    setData(cached); // instant paint (may be undefined on first ever load)
    setLoading(cached === undefined);
    void revalidate(false);
  }, [url, revalidate]);

  return { data, loading, error, refresh: () => revalidate(true) };
}
