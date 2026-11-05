'use client';
// Shared "today" data fetched once and reused across pages.
//
// WHOOP-today and pinned goals show up on multiple screens; without this each page
// would refetch them on mount. Mounted in the root layout, this provider keeps the
// data warm in the SWR cache across navigation, so revisiting a page is instant.
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useCachedFetch } from '@/lib/fetchCache';

export type PinnedGoal = {
  id: string;
  title: string;
  month: string;
  status: string;
  pinned: boolean;
  category?: string;
  period?: 'week' | 'month';
};

export type WhoopToday = {
  date?: string;
  bodyWeightKg?: number;
  recovery?: number;
  strain?: number;
  sleepHours?: number;
  sleepPerformance?: number;
  hrv?: number;
  rhr?: number;
} | null;

type TodayData = {
  whoopToday: WhoopToday;
  whoopLoading: boolean;
  pinnedGoals: PinnedGoal[];
  goalsEnabled: boolean;
  goalsLoading: boolean;
  refresh: () => void;
};

const TodayContext = createContext<TodayData | null>(null);

export function TodayDataProvider({ children }: { children: ReactNode }) {
  const whoop = useCachedFetch<{ day: WhoopToday }>('/api/whoop/daily?today=1', 5 * 60_000);
  const goals = useCachedFetch<{ enabled?: boolean; goals?: PinnedGoal[] }>('/api/goals?pinned=1', 60_000);

  // Stay fresh after mutations elsewhere (ziele edits, WHOOP sync) — mirrors the
  // existing `xp:changed` event pattern. The cache is already busted by the emitter,
  // so these refreshes hit the network only when data actually changed.
  useEffect(() => {
    const onGoals = () => void goals.refresh();
    const onWhoop = () => void whoop.refresh();
    window.addEventListener('goals:changed', onGoals);
    window.addEventListener('whoop:changed', onWhoop);
    return () => {
      window.removeEventListener('goals:changed', onGoals);
      window.removeEventListener('whoop:changed', onWhoop);
    };
  }, [goals, whoop]);

  const value: TodayData = {
    whoopToday: whoop.data?.day ?? null,
    whoopLoading: whoop.loading,
    pinnedGoals: goals.data?.goals ?? [],
    goalsEnabled: goals.data?.enabled !== false,
    goalsLoading: goals.loading,
    refresh: () => {
      void whoop.refresh();
      void goals.refresh();
    },
  };

  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}

export function useTodayData(): TodayData {
  const ctx = useContext(TodayContext);
  if (!ctx) throw new Error('useTodayData must be used within TodayDataProvider');
  return ctx;
}
