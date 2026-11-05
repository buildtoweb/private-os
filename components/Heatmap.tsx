'use client';

type Cell = { date: string; value: number; max: number };

export function Heatmap({ cells, weeks = 12 }: { cells: Cell[]; weeks?: number }) {
  // Group by ISO week, days = Mon..Sun
  const today = new Date();
  const totalDays = weeks * 7;
  const days: { date: string; label: string }[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), label: d.toLocaleDateString('de-DE') });
  }
  const map = new Map(cells.map(c => [c.date, c]));
  // Pad start to align week (Mon=0)
  const firstDay = new Date(days[0].date);
  const dow = (firstDay.getDay() + 6) % 7; // Mon=0
  const padded: ({ date: string; label: string } | null)[] = [...Array(dow).fill(null), ...days];

  const cols: ({ date: string; label: string } | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="label">Letzte {weeks} Wochen</span>
        <Legend />
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1">
          {cols.map((col, i) => (
            <div key={i} className="flex flex-col gap-1">
              {col.map((d, j) => {
                if (!d) return <div key={j} className="w-3 h-3" />;
                const c = map.get(d.date);
                const ratio = c ? c.value / Math.max(1, c.max) : 0;
                return (
                  <div
                    key={j}
                    className="w-3 h-3 rounded-[3px]"
                    title={`${d.label}: ${c?.value ?? 0}/${c?.max ?? 0}`}
                    style={{ background: cellColor(ratio, c?.value ?? 0) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function cellColor(ratio: number, value: number) {
  if (value === 0) return '#191719';
  if (ratio >= 0.85) return '#7ba888';
  if (ratio >= 0.6) return '#00a380';
  if (ratio >= 0.35) return '#e8a33d';
  return '#c97b5a';
}

function Legend() {
  return (
    <div className="flex items-center gap-1 text-[10px] text-secondary">
      <span>weniger</span>
      {[0.1, 0.4, 0.7, 0.95].map((r, i) => (
        <span key={i} className="w-3 h-3 rounded-[3px]" style={{ background: cellColor(r, 1) }} />
      ))}
      <span>mehr</span>
    </div>
  );
}
