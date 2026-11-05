'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties, DragEvent, TouchEvent } from 'react';
import { IconBell, IconCalendar, IconPriority, IconRepeat } from '@/components/icons';
import type { CalendarEvent, Task } from '@/lib/todo/types';
import { durationLabel, priorityLabels, priorityTint, themeTint } from './shared';
import styles from './planner.module.css';

type Props = {
  task: Task;
  done: boolean;
  size?: 'lg' | 'sm';
  showMeta?: boolean;
  /** Mark the priority (the to-do list already groups by it, so it is off there). */
  showPriority?: boolean;
  dropTarget?: boolean;
  draggable?: boolean;
  /** Lifted out by a touch drag: the row stays as a faded placeholder. */
  lifted?: boolean;
  /** Currently running (its time window contains now). */
  live?: { progress: number; remaining: number };
  onTouchStart?: (e: TouchEvent) => void;
  onOpen: () => void;
  onToggle: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
};

const spring = { type: 'spring', stiffness: 520, damping: 34 } as const;

export function TaskIcon({ emoji, theme, size = 40 }: { emoji: string; theme: Task['theme']; size?: number }) {
  return <span className={styles.taskIcon} style={{ '--tint': themeTint[theme], width: size, height: size, fontSize: Math.round(size * 0.5) } as CSSProperties} aria-hidden>{emoji}</span>;
}

export function TaskRow({ task, done, size = 'lg', showMeta = true, showPriority = false, dropTarget, draggable, lifted, live, onTouchStart, onOpen, onToggle, onDragStart, onDragEnd, onDragOver, onDrop }: Props) {
  const reduce = useReducedMotion();
  const steps = task.subtasks.length;
  const stepsDone = task.subtasks.filter(s => s.done).length;
  const flagged = showPriority && task.priority !== 'none';
  const meta = [task.time, live ? `noch ${durationLabel(live.remaining)}` : durationLabel(task.duration), steps ? `${stepsDone}/${steps} Schritte` : null].filter(Boolean).join(' · ');

  return <motion.div layout={!reduce} transition={{ layout: spring }}
    initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: lifted ? 0.3 : 1, y: 0, scale: lifted ? 0.97 : 1 }} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
    data-drop="task" data-task-id={task.id}
    className={`${styles.row} ${size === 'sm' ? styles.rowSm : ''} ${done ? styles.rowDone : ''} ${dropTarget ? styles.dropTarget : ''} ${lifted ? styles.rowLifted : ''} ${live && !done ? styles.rowLive : ''} ${flagged && task.priority === 'high' && !done ? styles.rowHigh : ''}`}
    style={flagged ? { '--prio': priorityTint[task.priority] } as CSSProperties : undefined}>
    {live && !done && <span className={styles.rowProgress} aria-hidden><motion.i initial={false} animate={{ width: `${Math.min(100, live.progress * 100)}%` }} transition={{ duration: 0.6 }} /></span>}
    {/* The drag and click surface is a plain div so HTML5 drag stays native on desktop. */}
    <div className={styles.rowMain} draggable={draggable} onTouchStart={onTouchStart} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop}>
      <button className={styles.rowOpen} onClick={onOpen} aria-label={`${task.title} öffnen`}>
        <TaskIcon emoji={task.emoji} theme={task.theme} size={size === 'sm' ? 32 : 42} />
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{task.title}</span>
          {showMeta && <span className={styles.rowMeta}>
            {flagged && <span className={styles.prioBadge}><IconPriority level={task.priority} size={9} />{priorityLabels[task.priority]}</span>}
            {meta}
            {task.repeat !== 'none' && <IconRepeat size={12} aria-label="wiederkehrend" />}
            {task.reminder !== null && task.date && <IconBell size={12} aria-label="mit Erinnerung" />}
          </span>}
        </span>
      </button>
    </div>
    <motion.button className={`${styles.check} ${done ? styles.checked : ''}`} onClick={onToggle}
      whileTap={reduce ? undefined : { scale: 0.82 }} transition={spring}
      aria-label={done ? `${task.title} wieder öffnen` : `${task.title} erledigen`} aria-pressed={done}>
      <motion.span className={styles.checkFill} initial={false} animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={reduce ? { duration: 0 } : spring} />
      <svg viewBox="0 0 24 24" width={size === 'sm' ? 14 : 17} height={size === 'sm' ? 14 : 17} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.path d="M5 12.5 10 17.5 19 7.5" initial={false} animate={{ pathLength: done ? 1 : 0 }} transition={reduce ? { duration: 0 } : { duration: 0.28, delay: done ? 0.08 : 0, ease: 'easeOut' }} />
      </svg>
    </motion.button>
  </motion.div>;
}

/** A calendar appointment between the tasks: read-only, no check. */
export function EventRow({ event, feed, tint, size = 'lg', live }: { event: CalendarEvent; feed: string; tint: string; size?: 'lg' | 'sm'; live?: boolean }) {
  const reduce = useReducedMotion();
  const meta = [event.time && event.end ? `${event.time}–${event.end}` : event.time, event.location, feed].filter(Boolean).join(' · ');
  return <motion.div layout={!reduce} transition={{ layout: spring }}
    initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.16 } }}
    className={`${styles.row} ${styles.eventRow} ${size === 'sm' ? styles.rowSm : ''} ${live ? styles.eventLive : ''}`} style={{ '--tint': tint } as CSSProperties}
    title={[event.title, meta].join('\n')}>
    <div className={styles.eventBody}>
      <span className={styles.eventIcon} style={{ width: size === 'sm' ? 32 : 42, height: size === 'sm' ? 32 : 42 }} aria-hidden><IconCalendar size={size === 'sm' ? 15 : 18} /></span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{event.title}</span>
        <span className={styles.rowMeta}>{meta}</span>
      </span>
    </div>
  </motion.div>;
}
