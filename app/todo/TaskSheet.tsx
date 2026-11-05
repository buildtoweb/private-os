'use client';

import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconClose, IconPlus, IconPriority, IconSparkle, IconTrash } from '@/components/icons';
import { ICON_LIBRARY, suggestIcons, taskAppearance, themeForEmoji } from '@/lib/todo/appearance';
import { SLOT_START, fromMinutes, slotForTime, startTime, toMinutes } from '@/lib/todo/schedule';
import type { Priority, Repeat, Task } from '@/lib/todo/types';
import { TaskIcon } from './TaskRow';
import { PRIORITIES, SLOTS, SlotIcon, addDays, fmtDayMonth, fromIso, priorityLabels, priorityTint, slotLabels, slotTint, suggestedSteps, uid } from './shared';
import styles from './planner.module.css';

type Props = {
  task: Task;
  isNew: boolean;
  today: string;
  mobile: boolean;
  pushOn: boolean;
  onSave: (task: Task) => void;
  onDelete: () => void;
  onClose: () => void;
};

const DURATIONS = [5, 15, 30, 45, 60, 90];
const REMINDERS: [number | null, string][] = [[null, 'Aus'], [0, 'Zum Start'], [5, '5 Min. vorher'], [15, '15 Min. vorher'], [30, '30 Min. vorher'], [60, '1 Std. vorher']];
const REPEATS: [Repeat, string][] = [['none', 'Nie'], ['daily', 'Täglich'], ['weekly', 'Wöchentlich'], ['monthly', 'Monatlich']];
const sheetSpring = { type: 'spring', stiffness: 380, damping: 36 } as const;

function Chip({ active, onClick, children, tint, label }: { active: boolean; onClick: () => void; children: ReactNode; tint?: string; label?: string }) {
  return <button type="button" className={`${styles.chip} ${active ? styles.chipOn : ''}`} style={tint ? { '--tint': tint } as CSSProperties : undefined} onClick={onClick} aria-pressed={active} aria-label={label}>{children}</button>;
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className={styles.sheetSection}><div className={styles.sheetSectionHead}><h3>{title}</h3>{aside}</div>{children}</section>;
}

/** How far the iOS keyboard covers the bottom of the layout viewport. */
function useKeyboardInset(enabled: boolean) {
  const [state, setState] = useState({ inset: 0, height: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setState({ inset: inset > 60 ? inset : 0, height: vv.height });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [enabled]);
  return state;
}

export function TaskSheet({ task, isNew, today, mobile, pushOn, onSave, onDelete, onClose }: Props) {
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const [draft, setDraft] = useState<Task>(task);
  // An icon counts as automatic until the user picks one; then renaming keeps it.
  const [autoIcon, setAutoIcon] = useState(() => isNew || task.emoji === taskAppearance(task.title).emoji);
  const [picker, setPicker] = useState(false);
  const [stepText, setStepText] = useState('');
  const dateInput = useRef<HTMLInputElement>(null);
  // New tasks start as just a title field; details open on demand.
  const [expanded, setExpanded] = useState(!isNew);
  const keyboard = useKeyboardInset(mobile);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  const set = (patch: Partial<Task>) => setDraft(d => ({ ...d, ...patch }));
  function rename(title: string) {
    set(autoIcon ? { title, ...taskAppearance(title) } : { title });
  }
  function pickIcon(emoji: string) {
    setAutoIcon(false);
    set({ emoji, theme: themeForEmoji(emoji) });
    setPicker(false);
  }
  function setTime(time: string | null) {
    // Picking a clock time turns on a reminder at the start, like Tiimo does,
    // and files the task under the section of the day the time falls in.
    set({ time, reminder: time && draft.reminder === null && !draft.time ? 0 : draft.reminder, ...(time ? { slot: slotForTime(time) } : {}) });
  }
  function save() {
    if (!draft.title.trim()) return;
    onSave({ ...draft, title: draft.title.trim() });
  }

  const tomorrow = addDays(today, 1);
  const customDate = draft.date && draft.date !== today && draft.date !== tomorrow;
  const suggestions = suggestIcons(draft.title, 10);
  const reminderAt = draft.date && draft.reminder !== null ? fromMinutes(toMinutes(startTime(draft)) - draft.reminder) : null;

  const content = <>
    <div className={styles.sheetHead} onPointerDown={e => { if (mobile) drag.start(e); }}>
      {mobile && <span className={styles.grabber} aria-hidden />}
      <div className={styles.sheetTitleRow}>
        <button type="button" className={styles.iconButton} onClick={() => setPicker(v => !v)} aria-label="Symbol wählen" aria-expanded={picker}>
          <TaskIcon emoji={draft.emoji} theme={draft.theme} size={58} />
        </button>
        <textarea className={styles.titleInput} value={draft.title} rows={1} autoFocus={isNew} placeholder="Was steht an?" aria-label="Aufgabe"
          onPointerDown={e => e.stopPropagation()}
          onChange={e => rename(e.target.value.replace(/\n/g, ''))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
        {!mobile && <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Schließen"><IconClose size={18} /></button>}
      </div>
    </div>

    <div className={styles.sheetBody}>
      <AnimatePresence initial={false}>
        {picker && <motion.div className={styles.picker} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.22 }}>
          <div className={styles.pickerInner}>
            <div className={styles.pickerHead}><span>Passend zum Titel</span>
              <button type="button" className={styles.linkButton} onClick={() => { setAutoIcon(true); set(taskAppearance(draft.title)); setPicker(false); }}><IconSparkle size={14} />Automatisch</button>
            </div>
            <div className={styles.emojiGrid}>{(suggestions.length ? suggestions : [taskAppearance(draft.title)]).map(s => <button type="button" key={s.emoji} className={draft.emoji === s.emoji ? styles.emojiOn : ''} onClick={() => pickIcon(s.emoji)} aria-label={`Symbol ${s.emoji}`}>{s.emoji}</button>)}</div>
            {ICON_LIBRARY.map(group => <div key={group.label}>
              <div className={styles.pickerHead}><span>{group.label}</span></div>
              <div className={styles.emojiGrid}>{group.emojis.map(emoji => <button type="button" key={emoji} className={draft.emoji === emoji ? styles.emojiOn : ''} onClick={() => pickIcon(emoji)} aria-label={`Symbol ${emoji}`}>{emoji}</button>)}</div>
            </div>)}
          </div>
        </motion.div>}
      </AnimatePresence>

      {!expanded ? <div className={styles.compact}>
        <div className={styles.compactChips}>
          <Chip active={draft.date === today} onClick={() => set({ date: today })}>Heute</Chip>
          <Chip active={draft.date === tomorrow} onClick={() => set({ date: tomorrow })}>Morgen</Chip>
          <Chip active={!draft.date} onClick={() => set({ date: null })}>Ohne Datum</Chip>
          {draft.date && !draft.time && <Chip active tint={slotTint[draft.slot]} onClick={() => set({ slot: SLOTS[(SLOTS.indexOf(draft.slot) + 1) % SLOTS.length] })} label="Tageszeit wechseln"><SlotIcon slot={draft.slot} size={15} />{slotLabels[draft.slot]}</Chip>}
        </div>
        <button type="button" className={styles.moreButton} onClick={() => setExpanded(true)}>
          <IconPlus size={15} />Uhrzeit, Dauer, Erinnerung …
        </button>
      </div> : <>
      <Section title="Wann">
        <div className={styles.chipRow}>
          <Chip active={draft.date === today} onClick={() => set({ date: today })}>Heute</Chip>
          <Chip active={draft.date === tomorrow} onClick={() => set({ date: tomorrow })}>Morgen</Chip>
          <Chip active={Boolean(customDate)} onClick={() => { const el = dateInput.current; if (el) { try { el.showPicker(); } catch { el.focus(); } } }}>
            {customDate ? fmtDayMonth.format(fromIso(draft.date!)) : 'Datum …'}
          </Chip>
          <Chip active={!draft.date} onClick={() => set({ date: null })}>Ohne Datum</Chip>
          <input ref={dateInput} className={styles.hiddenDate} type="date" value={draft.date ?? ''} onChange={e => set({ date: e.target.value || null })} tabIndex={-1} aria-hidden />
        </div>
        {draft.date && !draft.time && <div className={styles.chipRow}>
          {SLOTS.map(slot => <Chip key={slot} active={draft.slot === slot} tint={slotTint[slot]} onClick={() => set({ slot })}><SlotIcon slot={slot} size={15} />{slotLabels[slot]}</Chip>)}
        </div>}
        {draft.date && <div className={styles.timeRow}>
          <label className={styles.timeField}><span>Uhrzeit</span>
            <input type="time" value={draft.time ?? ''} onChange={e => setTime(e.target.value || null)} />
          </label>
          {draft.time ? <>
            <span className={styles.hint}>Unter {slotLabels[draft.slot]}</span>
            <button type="button" className={styles.linkButton} onClick={() => setTime(null)}>Ohne Uhrzeit</button>
          </> : <span className={styles.hint}>Sonst gilt der Beginn: {SLOT_START[draft.slot]}</span>}
        </div>}
      </Section>

      <Section title="Dauer">
        <div className={styles.chipRow}>
          {DURATIONS.map(d => <Chip key={d} active={draft.duration === d} onClick={() => set({ duration: d })}>{d < 60 ? `${d} Min.` : d === 60 ? '1 Std.' : '1,5 Std.'}</Chip>)}
          <label className={`${styles.chip} ${!DURATIONS.includes(draft.duration) ? styles.chipOn : ''} ${styles.chipInput}`}>
            <input type="number" inputMode="numeric" min={1} max={1440} placeholder="Andere" value={DURATIONS.includes(draft.duration) ? '' : draft.duration} onChange={e => { const n = Number(e.target.value); if (n) set({ duration: Math.min(1440, Math.max(1, Math.round(n))) }); }} aria-label="Andere Dauer in Minuten" />Min.
          </label>
        </div>
      </Section>

      <Section title="Erinnerung">
        <div className={styles.chipRow}>
          {REMINDERS.map(([value, label]) => <Chip key={label} active={draft.reminder === value} onClick={() => set({ reminder: value })}>{label}</Chip>)}
        </div>
        <p className={styles.hint}>
          {!draft.date ? 'Erinnerungen gibt es für geplante Aufgaben – wähle oben einen Tag.'
            : draft.reminder === null ? 'Keine Push-Mitteilung für diese Aufgabe.'
            : `Push um ${reminderAt}${draft.repeat !== 'none' ? ' an jedem Termin' : ''}.${pushOn ? '' : ' Aktiviere Erinnerungen über die Glocke oben.'}`}
        </p>
      </Section>

      <Section title="Priorität">
        <div className={styles.chipRow}>
          {PRIORITIES.map(p => <Chip key={p} active={draft.priority === p} tint={priorityTint[p]} onClick={() => set({ priority: p as Priority })}><span className={styles.priorityGlyph}><IconPriority level={p} size={12} /></span>{p === 'none' ? 'Keine' : priorityLabels[p]}</Chip>)}
        </div>
      </Section>

      {draft.date && <Section title="Wiederholen">
        <div className={styles.chipRow}>{REPEATS.map(([value, label]) => <Chip key={value} active={draft.repeat === value} onClick={() => set({ repeat: value })}>{label}</Chip>)}</div>
      </Section>}

      <Section title={`Teilschritte${draft.subtasks.length ? ` · ${draft.subtasks.filter(s => s.done).length}/${draft.subtasks.length}` : ''}`}
        aside={<button type="button" className={styles.linkButton} onClick={() => set({ subtasks: [...draft.subtasks, ...suggestedSteps(draft.title).filter(t => !draft.subtasks.some(s => s.title === t)).map(title => ({ id: uid(), title, done: false }))] })}><IconSparkle size={14} />Vorschlagen</button>}>
        <div className={styles.steps}>
          <AnimatePresence initial={false}>
            {draft.subtasks.map(s => <motion.div key={s.id} className={`${styles.step} ${s.done ? styles.stepDone : ''}`} layout={!reduce} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <button type="button" className={`${styles.stepCheck} ${s.done ? styles.checked : ''}`} onClick={() => set({ subtasks: draft.subtasks.map(x => x.id === s.id ? { ...x, done: !x.done } : x) })} aria-label={`${s.title} umschalten`} aria-pressed={s.done}>{s.done && <IconCheck size={13} />}</button>
              <span>{s.title}</span>
              <button type="button" className={styles.stepRemove} onClick={() => set({ subtasks: draft.subtasks.filter(x => x.id !== s.id) })} aria-label="Teilschritt entfernen"><IconClose size={14} /></button>
            </motion.div>)}
          </AnimatePresence>
          <form className={styles.stepAdd} onSubmit={e => { e.preventDefault(); const title = stepText.trim(); if (title) { set({ subtasks: [...draft.subtasks, { id: uid(), title, done: false }] }); setStepText(''); } }}>
            <input value={stepText} onChange={e => setStepText(e.target.value)} placeholder="Teilschritt hinzufügen" aria-label="Teilschritt hinzufügen" />
            <button aria-label="Teilschritt speichern" disabled={!stepText.trim()}><IconPlus size={16} /></button>
          </form>
        </div>
      </Section>

      <Section title="Notizen">
        <textarea className={`input ${styles.notes}`} value={draft.notes} onChange={e => set({ notes: e.target.value })} placeholder="Gedanken, Links, Details …" rows={3} />
      </Section>
      </>}
    </div>

    <div className={styles.sheetFooter}>
      {!isNew && <button type="button" className={styles.deleteButton} onClick={onDelete} aria-label="Aufgabe löschen"><IconTrash size={17} /></button>}
      <button type="button" className="btn-ghost" onClick={onClose}>Abbrechen</button>
      <button type="button" className={`btn-primary ${styles.saveButton}`} disabled={!draft.title.trim()} onClick={save}>{isNew ? 'Hinzufügen' : 'Speichern'}</button>
    </div>
  </>;

  return createPortal(<motion.div className={styles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
    onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <motion.div role="dialog" aria-modal="true" aria-label={isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten'}
      className={`${mobile ? styles.sheet : styles.dialog} ${!expanded ? styles.sheetCompact : ''}`}
      style={mobile && keyboard.inset ? { marginBottom: keyboard.inset, maxHeight: keyboard.height - 12 } : undefined}
      initial={reduce ? { opacity: 0 } : mobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 12 }}
      animate={mobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : mobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 8 }}
      transition={sheetSpring}
      drag={mobile ? 'y' : false} dragControls={drag} dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
      onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose(); }}>
      {content}
    </motion.div>
  </motion.div>, document.body);
}
