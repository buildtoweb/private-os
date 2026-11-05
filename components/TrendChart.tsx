'use client';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

type Point = { date: string; value: number };

type Props = {
  data: Point[];
  color?: string;
  label?: string;
  height?: number;
  unit?: string;
};

export function TrendChart({ data, color = '#7ba888', label, height = 120, unit = '' }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const reduced = useReducedMotion();
  const gradId = useId().replace(/:/g, '');

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(120, e.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const padding = { top: 12, right: 8, bottom: 16, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { pathD, areaD, points, min, max } = useMemo(() => {
    if (data.length === 0) return { pathD: '', areaD: '', points: [] as { x: number; y: number; v: number; date: string }[], min: 0, max: 0 };
    const values = data.map(d => d.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW;
    const points = data.map((d, i) => ({
      x: padding.left + i * xStep,
      y: padding.top + innerH - ((d.value - min) / (max - min)) * innerH,
      v: d.value,
      date: d.date,
    }));
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + innerH} L ${points[0].x} ${padding.top + innerH} Z`;
    return { pathD, areaD, points, min, max };
  }, [data, innerW, innerH, padding.left, padding.top]);

  const pathRef = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (!pathRef.current || data.length === 0) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = `${len}`;
    pathRef.current.style.strokeDashoffset = reduced ? '0' : `${len}`;
    if (reduced) return;
    let cancelled = false;
    (async () => {
      const { default: gsap } = await import('gsap');
      if (cancelled) return;
      gsap.to(pathRef.current, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.out' });
    })();
    return () => { cancelled = true; };
  }, [pathD, reduced, data.length]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let nearest = 0, dist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - x);
      if (d < dist) { dist = d; nearest = i; }
    }
    setHover({ i: nearest, x: points[nearest].x, y: points[nearest].y });
  }

  return (
    <div className="card" ref={wrapRef}>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <div className="label">{label}</div>
          {hover && (
            <motion.div
              key={hover.i}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm font-semibold tabular-nums"
              style={{ color }}
            >
              {points[hover.i].v.toFixed(1)}{unit}
            </motion.div>
          )}
        </div>
      )}
      <svg
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {areaD && (
          <motion.path
            d={areaD}
            fill={`url(#${gradId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.6 }}
          />
        )}
        {pathD && (
          <path
            ref={pathRef}
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hover?.i === i ? 5 : 3}
            fill={color}
            style={{ transition: 'r 160ms ease-out' }}
          />
        ))}
        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={padding.top}
            y2={padding.top + innerH}
            stroke={color}
            strokeOpacity={0.3}
            strokeDasharray="3 3"
          />
        )}
      </svg>
      {hover && (
        <div className="text-[10px] text-secondary mt-1 tabular-nums">
          {new Date(points[hover.i].date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
        </div>
      )}
    </div>
  );
}
