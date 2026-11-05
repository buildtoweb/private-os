'use client';
import { useTodayData } from '@/components/TodayDataProvider';
import { IconPin } from '@/components/icons';
import { GoalCard } from '@/components/GoalCard';

export function PinnedGoals() {
  const { pinnedGoals: goals, goalsEnabled: enabled, goalsLoading: loading } = useTodayData();

  // Only show the skeleton on the very first load (no cached data yet).
  if (loading && goals.length === 0) return <div className="card h-28 animate-pulse mt-6 hidden lg:block" />;

  if (!enabled) {
    return (
      <div className="card border-dashed mt-6 hidden lg:block">
        <div className="flex items-center gap-3">
          <IconPin size={22} className="text-secondary shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Ziele konnten nicht geladen werden</div>
            <p className="text-secondary text-sm mt-1">
              Die Ziele liegen in Supabase (<code className="text-xs bg-base px-1 py-0.5 rounded">private.goals</code>). Prüfe <code className="text-xs bg-base px-1 py-0.5 rounded">SUPABASE_URL</code> / <code className="text-xs bg-base px-1 py-0.5 rounded">SUPABASE_SECRET_KEY</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (goals.length === 0) return null;

  return (
    <section className="mt-6 hidden lg:block">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-secondary">Angepinnt</h2>
        <a href="/reflexion?tab=goals" className="text-xs text-secondary hover:text-primary">Alle anzeigen →</a>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {goals.map((g, i) => (
          // Mobile shows at most two notes; the rest appear from md upward.
          <GoalCard key={g.id} goal={g} className={i >= 2 ? 'hidden md:flex' : ''} />
        ))}
      </div>
    </section>
  );
}
