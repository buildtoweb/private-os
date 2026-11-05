'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { appToday } from '@/lib/date';
import { IconChevronDown } from './icons';
import { dailyReflectionPenalty, dailyReflectionXP } from '@/lib/xp';
import { awardXP } from './XPBar';

type Reflection = {
  dankbar?: string;
  intention?: string;
  gutGemacht?: string;
  besserMorgen?: string;
};

type Props = {
  initial: Reflection;
  onSave: (patch: Reflection) => Promise<void> | void;
  date?: string;
};

export function DailyReflection({ initial, onSave, date }: Props) {
  const [r, setR] = useState<Reflection>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const xpAwardedRef = useRef(false);

  useEffect(() => {
    const hadAny = !!(initial.dankbar || initial.intention || initial.gutGemacht || initial.besserMorgen);
    xpAwardedRef.current = hadAny;
  }, [initial.dankbar, initial.intention, initial.gutGemacht, initial.besserMorgen]);

  useEffect(() => { setR(initial); }, [initial.dankbar, initial.intention, initial.gutGemacht, initial.besserMorgen]);

  async function save(field: keyof Reflection, value: any) {
    setSaving(field);
    const nextReflection = { ...r, [field]: value };
    setR(nextReflection);
    try {
      await onSave({ [field]: value });
      const hasAnyContent = Object.values(nextReflection).some(x => typeof x === 'string' && x.trim().length > 0);
      const xpDate = date || todayISO();
      if (hasAnyContent && !xpAwardedRef.current) {
        xpAwardedRef.current = true;
        awardXP('daily_reflection', dailyReflectionXP(), xpDate, `${xpDate}:daily_reflection`);
      }
      if (!hasAnyContent && xpAwardedRef.current) {
        xpAwardedRef.current = false;
        awardXP('daily_reflection_missed', dailyReflectionPenalty(), xpDate, `${xpDate}:daily_reflection:penalty`);
      }
    } finally { setSaving(null); }
  }

  const filled = [r.dankbar, r.intention, r.gutGemacht, r.besserMorgen].filter(x => x && x.trim()).length;
  const totalFields = 4;
  const progress = filled / totalFields;

  return (
    <div className="card">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-sm">Tägliche Reflexion</span>
            <span className="text-secondary text-xs shrink-0">{filled} / {totalFields}</span>
          </div>
          <div className="mt-2 h-0.5 rounded-full bg-base shadow-well overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%`, background: progress === 1 ? 'var(--success)' : 'var(--primary)' }}
            />
          </div>
        </div>
        <IconChevronDown size={16} className="text-secondary ml-4 shrink-0 transition-transform" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} />
      </button>

      {open && (
        <div className="mt-5 space-y-6 fade-in">
          <ReflectionSection label="Morgen">
            <Field
              label="Wofür bin ich dankbar?"
              value={r.dankbar || ''}
              onCommit={(v) => save('dankbar', v)}
              saving={saving === 'dankbar'}
              placeholder="3 Dinge, die heute schön sind…"
              rows={3}
            />
            <Field
              label="Was ist heute meine Intention?"
              value={r.intention || ''}
              onCommit={(v) => save('intention', v)}
              saving={saving === 'intention'}
              placeholder="Wie will ich heute in den Tag gehen?"
              rows={2}
            />
          </ReflectionSection>

          <ReflectionSection label="Abend">
            <Field
              label="Was habe ich heute gut gemacht?"
              value={r.gutGemacht || ''}
              onCommit={(v) => save('gutGemacht', v)}
              saving={saving === 'gutGemacht'}
              placeholder="Heutige Wins…"
              rows={3}
            />
            <Field
              label="Was kann ich morgen besser machen?"
              value={r.besserMorgen || ''}
              onCommit={(v) => save('besserMorgen', v)}
              saving={saving === 'besserMorgen'}
              placeholder="Eine Sache für morgen…"
              rows={2}
            />
          </ReflectionSection>
        </div>
      )}
    </div>
  );
}

function todayISO() {
  return appToday();
}

function ReflectionSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div className="label mb-3">{label}</div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const AUTOSAVE_DELAY = 1200;

function Field({ label, value, onCommit, saving, placeholder, rows }: {
  label: string; value: string; saving: boolean; placeholder: string; rows: number;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  // Refs let the unmount/flush handlers see the latest values without re-subscribing.
  const savedRef = useRef(value);
  const commitRef = useRef(onCommit);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { commitRef.current = onCommit; }, [onCommit]);
  useEffect(() => { savedRef.current = value; setV(value); }, [value]);

  function flush() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next != null && next !== savedRef.current) {
      savedRef.current = next;
      commitRef.current(next);
    }
  }

  function handleChange(next: string) {
    setV(next);
    pendingRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, AUTOSAVE_DELAY); // auto-save shortly after typing stops
  }

  // Flush on unmount (e.g. navigating away) so in-progress text is never lost.
  useEffect(() => () => flush(), []);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-secondary">{label}</label>
        {saving && <span className="text-[10px] text-muted pulse-dot">speichern…</span>}
      </div>
      <textarea
        value={v}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={flush}
        rows={rows}
        placeholder={placeholder}
        className="input resize-none leading-relaxed"
      />
    </div>
  );
}
