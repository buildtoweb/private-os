'use client';
import { useEffect, useState } from 'react';

const COLORS = ['#c97b5a', '#c97b5a', '#c97b5a', '#c97b5a', '#e8a33d', '#e8a33d', '#8b8299', '#7d93b0', '#7ba888', '#7ba888'];

export function MoodSlider({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  const [v, setV] = useState<number>(value ?? 7);
  useEffect(() => { if (value != null) setV(value); }, [value]);
  const color = COLORS[Math.max(0, Math.min(9, v - 1))];
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="label">Mood heute</span>
        <span className="text-2xl font-semibold" style={{ color }}>{v}</span>
      </div>
      <input
        type="range" min={1} max={10} step={1} value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => onChange(v)}
        onKeyUp={(e) => e.key === 'Enter' && onChange(v)}
        className="w-full appearance-none h-2 rounded-full outline-none"
        style={{ background: `linear-gradient(to right, ${color} 0%, ${color} ${(v - 1) * 11.11}%, #2a272b ${(v - 1) * 11.11}%, #2a272b 100%)` }}
        aria-label="Mood von 1 bis 10"
      />
      <div className="mt-2 flex justify-between text-[10px] text-secondary">
        <span>1</span><span>5</span><span>10</span>
      </div>
      <style jsx>{`
        input[type=range]::-webkit-slider-thumb {
          appearance: none; width: 22px; height: 22px; border-radius: 50%;
          background: ${color}; border: 3px solid #191719; cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 22px; height: 22px; border-radius: 50%;
          background: ${color}; border: 3px solid #191719; cursor: pointer;
        }
      `}</style>
    </div>
  );
}
