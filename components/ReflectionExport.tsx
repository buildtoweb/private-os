'use client';
import { useEffect, useMemo, useState } from 'react';

type ReflectType = 'Woche' | 'Monat' | 'Tag';
type Entry = { id: string; title: string; text: string; date: string; type?: ReflectType };

type Format = 'md' | 'pdf';
type Mode = 'period' | 'year' | 'select';
type Split = 'full' | 'half' | 'quarter';

const PRESETS: { key: string; label: string }[] = [
  { key: 'thisMonth', label: 'Dieser Monat' },
  { key: 'lastMonth', label: 'Letzter Monat' },
  { key: 'last30', label: 'Letzte 30 Tage' },
  { key: 'thisYear', label: 'Dieses Jahr' },
  { key: 'lastYear', label: 'Letztes Jahr' },
  { key: 'all', label: 'Alles' },
];

export function ReflectionExport({ open, onClose, type, typeLabel }: {
  open: boolean;
  onClose: () => void;
  type: ReflectType;
  typeLabel: string;
}) {
  const [format, setFormat] = useState<Format>('md');
  const [mode, setMode] = useState<Mode>('period');
  const [preset, setPreset] = useState('thisMonth');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [split, setSplit] = useState<Split>('full');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    fetch(`/api/reflect/export?type=${type}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Laden fehlgeschlagen');
        const sorted: Entry[] = (j.entries || []).slice().sort((a: Entry, b: Entry) => a.date.localeCompare(b.date));
        setEntries(sorted);
      })
      .catch((e) => setError(e?.message || 'Einträge konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [open, type]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Years that actually have entries, newest first — drives the year picker.
  const years = useMemo(() => {
    const set = new Set(entries.map((e) => e.date.slice(0, 4)).filter(Boolean));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [entries]);

  // Keep the selected year valid once entries load (fall back to the newest year).
  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[0]);
  }, [years]); // eslint-disable-line react-hooks/exhaustive-deps

  // One descriptor per file the year-export will produce, with its entry count.
  // Empty periods are dropped so we never hand out a blank file.
  const yearFiles = useMemo(() => {
    return yearChunks(year, split)
      .map((c) => ({ ...c, count: entries.filter((e) => e.date >= c.start && e.date <= c.end).length }))
      .filter((c) => c.count > 0);
  }, [year, split, entries]);

  const resolved = useMemo(() => {
    if (mode === 'select') return entries.filter((e) => selected.has(e.id));
    if (mode === 'year') {
      return entries.filter((e) => e.date >= `${year}-01-01` && e.date <= `${year}-12-31`);
    }
    const range = presetRange(preset);
    if (!range) return entries;
    const [start, end] = range;
    return entries.filter((e) => e.date >= start && e.date <= end);
  }, [mode, preset, year, entries, selected]);

  if (!open) return null;

  async function doExport() {
    if (!resolved.length) return;
    setBusy(true);
    try {
      if (mode === 'year') {
        await exportYear();
      } else {
        const title = `Reflexionen (${typeLabel})`;
        const stamp = toISO(new Date());
        const base = `reflexion-${typeLabel.toLowerCase()}-${stamp}`;
        if (format === 'md') {
          downloadBlob(`${base}.md`, buildMarkdown(resolved, title), 'text/markdown;charset=utf-8');
        } else {
          await buildPdf(resolved, title, `${base}.pdf`);
        }
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Export fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  // Year export: one file per non-empty period (whole year / halves / quarters).
  // Each file is titled and stamped with its exact period so the AI reading it
  // knows which timeframe it covers. Downloads are staggered so the browser
  // doesn't drop the later files when several are triggered at once.
  async function exportYear() {
    const ext = format === 'md' ? 'md' : 'pdf';
    for (let i = 0; i < yearFiles.length; i++) {
      const chunk = yearFiles[i];
      const items = entries.filter((e) => e.date >= chunk.start && e.date <= chunk.end);
      if (!items.length) continue;
      const title = `Reflexionen (${typeLabel}) — ${chunk.periodLabel}`;
      const meta = [`**Zeitraum:** ${chunk.rangeLabel}`, `**Einträge:** ${items.length}`];
      const filename = `reflexion-${typeLabel.toLowerCase()}-${chunk.suffix}.${ext}`;
      if (format === 'md') {
        downloadBlob(filename, buildMarkdown(items, title, meta), 'text/markdown;charset=utf-8');
      } else {
        await buildPdf(items, title, filename, meta);
      }
      if (i < yearFiles.length - 1) await sleep(350);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="safe-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-semibold text-primary mb-1">Reflexionen exportieren</p>
        <p className="text-secondary text-xs mb-4">{typeLabel}-Reflexionen als Datei für deine KI sichern.</p>

        <label className="label block mb-1.5">Format</label>
        <Segmented
          options={[{ value: 'md', label: 'Markdown (.md)' }, { value: 'pdf', label: 'PDF' }]}
          value={format}
          onChange={(v) => setFormat(v as Format)}
        />

        <label className="label block mb-1.5 mt-4">Auswahl</label>
        <Segmented
          options={[
            { value: 'period', label: 'Zeitraum' },
            { value: 'year', label: 'Jahr' },
            { value: 'select', label: 'Einträge wählen' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
        />

        {mode === 'period' && (
          <div className="mt-3">
            <Segmented
              options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
              value={preset}
              onChange={setPreset}
            />
          </div>
        )}

        {mode === 'year' && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="label block mb-1.5">Jahr</label>
              {years.length ? (
                <Segmented
                  options={years.map((y) => ({ value: y, label: y }))}
                  value={year}
                  onChange={setYear}
                />
              ) : (
                <p className="text-secondary text-sm">Keine Einträge.</p>
              )}
            </div>
            <div>
              <label className="label block mb-1.5">Aufteilung</label>
              <Segmented
                options={[
                  { value: 'full', label: 'Ganzes Jahr (1 Datei)' },
                  { value: 'half', label: 'Halbjahre (2 Dateien)' },
                  { value: 'quarter', label: 'Quartale (4 Dateien)' },
                ]}
                value={split}
                onChange={(v) => setSplit(v as Split)}
              />
              <p className="text-secondary text-xs mt-2">
                {yearFiles.length
                  ? `Ergibt ${yearFiles.length} ${yearFiles.length === 1 ? 'Datei' : 'Dateien'}: ${yearFiles.map((c) => c.periodLabel).join(', ')}.`
                  : 'Keine Einträge in diesem Jahr.'}
              </p>
            </div>
          </div>
        )}

        {mode === 'select' && (
          <div className="mt-3 rounded-card border border-border bg-base divide-y divide-white/[0.05] max-h-56 overflow-y-auto">
            {loading && <div className="p-3 text-secondary text-sm">Lade…</div>}
            {!loading && entries.length === 0 && <div className="p-3 text-secondary text-sm">Keine Einträge.</div>}
            {entries.map((e) => (
              <label key={e.id} className="flex items-start gap-2.5 p-2.5 cursor-pointer hover:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="mt-0.5 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm truncate">{e.title || '(ohne Titel)'}</span>
                  <span className="block text-secondary text-xs">{formatDate(e.date)}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {error && <p className="text-red text-xs mt-3">{error}</p>}

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.06]">
          <span className="text-secondary text-xs tabular-nums">
            {loading ? 'Lade…' : `${resolved.length} ${resolved.length === 1 ? 'Eintrag' : 'Einträge'}`}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
            <button
              className="btn btn-primary disabled:opacity-50"
              onClick={doExport}
              disabled={busy || loading || resolved.length === 0}
            >
              {busy ? 'Exportiere…' : 'Herunterladen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              active ? 'bg-brand text-white' : 'border border-border text-secondary hover:border-brand/50 hover:text-primary'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function presetRange(preset: string): [string, string] | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'thisMonth': return [toISO(new Date(y, m, 1)), toISO(new Date(y, m + 1, 0))];
    case 'lastMonth': return [toISO(new Date(y, m - 1, 1)), toISO(new Date(y, m, 0))];
    case 'last30': { const s = new Date(now); s.setDate(s.getDate() - 30); return [toISO(s), toISO(now)]; }
    case 'thisYear': return [toISO(new Date(y, 0, 1)), toISO(new Date(y, 11, 31))];
    case 'lastYear': return [toISO(new Date(y - 1, 0, 1)), toISO(new Date(y - 1, 11, 31))];
    case 'all': default: return null;
  }
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// Period descriptors for a year export. Halves are Q1–Q2 / Q3–Q4 as requested.
function yearChunks(year: string, split: Split): {
  suffix: string; periodLabel: string; rangeLabel: string; start: string; end: string;
}[] {
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const q = (n: number) => {
    const startMonth = (n - 1) * 3;
    return { start: toISO(new Date(y, startMonth, 1)), end: toISO(new Date(y, startMonth + 3, 0)) };
  };
  const range = (start: string, end: string) => `${formatDate(start)} – ${formatDate(end)}`;
  if (split === 'full') {
    const s = toISO(new Date(y, 0, 1)), e = toISO(new Date(y, 11, 31));
    return [{ suffix: year, periodLabel: `${year} (gesamtes Jahr)`, rangeLabel: range(s, e), start: s, end: e }];
  }
  if (split === 'half') {
    const q1 = q(1), q2 = q(2), q3 = q(3), q4 = q(4);
    return [
      { suffix: `${year}-H1`, periodLabel: `${year} · 1. Halbjahr (Q1–Q2)`, rangeLabel: range(q1.start, q2.end), start: q1.start, end: q2.end },
      { suffix: `${year}-H2`, periodLabel: `${year} · 2. Halbjahr (Q3–Q4)`, rangeLabel: range(q3.start, q4.end), start: q3.start, end: q4.end },
    ];
  }
  return [1, 2, 3, 4].map((n) => {
    const { start, end } = q(n);
    return { suffix: `${year}-Q${n}`, periodLabel: `${year} · Q${n}`, rangeLabel: range(start, end), start, end };
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMarkdown(entries: Entry[], title: string, meta?: string[]) {
  const lines = [`# ${title}`, ''];
  if (meta?.length) { lines.push(...meta, ''); }
  for (const e of entries) {
    lines.push(`## ${e.title || '(ohne Titel)'}`);
    lines.push(`*${formatDate(e.date)}*`);
    lines.push('');
    lines.push((e.text || '').trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function buildPdf(entries: Entry[], title: string, filename: string, meta?: string[]) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin;
  const ensure = (h: number) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; } };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(title, maxW) as string[];
  ensure(titleLines.length * 20 + 4);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 20 + 4;

  if (meta?.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110);
    for (const line of meta) {
      const plain = line.replace(/\*\*/g, '');
      ensure(14);
      doc.text(plain, margin, y);
      y += 14;
    }
    doc.setTextColor(25);
  }
  y += 10;

  for (const e of entries) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const headLines = doc.splitTextToSize(e.title || '(ohne Titel)', maxW) as string[];
    ensure(headLines.length * 16 + 4);
    doc.text(headLines, margin, y);
    y += headLines.length * 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(130);
    ensure(13);
    doc.text(formatDate(e.date), margin, y);
    y += 15;

    doc.setTextColor(25);
    doc.setFontSize(11);
    const bodyLines = doc.splitTextToSize((e.text || '').trim(), maxW) as string[];
    for (const ln of bodyLines) { ensure(15); doc.text(ln, margin, y); y += 15; }
    y += 18;
  }

  doc.save(filename);
}
