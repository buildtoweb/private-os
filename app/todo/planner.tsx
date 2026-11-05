'use client';

import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { AnimatedTabs } from '@/components/AnimatedTabs';
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconPlus, IconPriority } from '@/components/icons';
import { appToday } from '@/lib/date';
import { taskAppearance } from '@/lib/todo/appearance';
import { doneOn, occursOn, slotForTime, toMinutes } from '@/lib/todo/schedule';
import type { CalendarEvent, CalendarFeed, Priority, Slot, Task } from '@/lib/todo/types';
import { CalendarButton } from './CalendarButton';
import { PushButton } from './PushButton';
import { usePush } from '@/lib/usePush';
import { EventRow, TaskIcon, TaskRow } from './TaskRow';
import { TaskSheet } from './TaskSheet';
import {
  PRIORITIES, SLOTS, SlotIcon, addDays, blankTask, feedTint, fmtMonth, fmtWeekdayLong, fmtWeekdayShort, fromIso, iso,
  priorityLabels, priorityTint, slotLabels, slotTint, startOfWeek, todoRequest, weekdayInitial,
} from './shared';
import styles from './planner.module.css';

type View = 'day' | 'three' | 'week' | 'month';
type MobileTab = 'day' | 'todo';
type Editing = { task: Task; isNew: boolean };
type DropTarget = { key: string; date: string | null; slot: Slot; priority: Priority; beforeId?: string; keepSlot?: boolean; keepPriority?: boolean };

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2, none: 3 };
const LEGACY_KEY = 'private-dashboard-planner-v1';
const VIEW_KEY = 'planner-view';
const COLLAPSE_KEY = 'planner-collapsed';

function useMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked */ }
}

export default function Planner() {
  const reduce = useReducedMotion();
  const mobile = useMobile();
  const push = usePush();
  // The planner day, like the habits, turns over at 01:00 (lib/date).
  const [today, setToday] = useState(() => appToday());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legacyCount, setLegacyCount] = useState(0);
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<View>('three');
  const [tab, setTab] = useState<MobileTab>('day');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [quick, setQuick] = useState<string | null>(null);
  const [quickText, setQuickText] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  // Freshly checked tasks stay in place for a moment so the check animation is
  // seen before the row sinks to the bottom of its section.
  const [settling, setSettling] = useState<string[]>([]);
  const [dayDirection, setDayDirection] = useState(0);
  const deepLinked = useRef(false);
  const [clockDate, setClockDate] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setClockDate(new Date()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  const swipe = useDragControls();
  // Touch drag (iOS has no HTML5 drag and drop): long-press lifts a row into a
  // floating ghost that follows the finger; whatever [data-drop] element is
  // under the finger when it lifts off receives the task.
  const [ghost, setGhost] = useState<{ task: Task; x: number; y: number; dx: number; dy: number; width: number } | null>(null);
  const touchRef = useRef<{ task: Task; timer: number; x0: number; y0: number; dx: number; dy: number; width: number; active: boolean; target: DropTarget | null; scroll: number } | null>(null);
  const suppressClick = useRef(false);

  const load = useCallback(async () => {
    try { const result = await todoRequest('GET'); setTasks(result.tasks || []); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Aufgaben konnten nicht geladen werden.'); }
  }, []);

  useEffect(() => {
    setView(readStored<View>(VIEW_KEY, 'three'));
    setCollapsed(readStored<string[]>(COLLAPSE_KEY, []));
    const legacy = readStored<unknown[]>(LEGACY_KEY, []);
    if (Array.isArray(legacy)) setLegacyCount(legacy.length);
    void load().finally(() => setLoaded(true));
    // Agent edits and other devices show up when the app comes back to the front.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setToday(appToday());
      void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, [load]);

  // A push notification opens /todo?task=<id>.
  useEffect(() => {
    if (!loaded || deepLinked.current) return;
    deepLinked.current = true;
    const id = new URLSearchParams(window.location.search).get('task');
    const task = id ? tasks.find(t => t.id === id) : undefined;
    if (!task) return;
    if (task.date) { setAnchor(task.date >= today ? task.date : today); setTab('day'); } else setTab('todo');
    setEditing({ task, isNew: false });
    window.history.replaceState(null, '', '/todo');
  }, [loaded, tasks, today]);

  async function write(method: 'POST' | 'PATCH' | 'DELETE', payload: object) {
    try {
      const result = await todoRequest(method, payload);
      if (result.task) setTasks(prev => prev.some(t => t.id === result.task!.id) ? prev.map(t => t.id === result.task!.id ? result.task! : t) : [...prev, result.task!]);
      setError(null);
    } catch (e) {
      await load();
      setError(e instanceof Error ? e.message : 'Änderung konnte nicht gespeichert werden.');
    }
  }

  async function importLegacy() {
    try {
      const stored = readStored<Task[]>(LEGACY_KEY, []);
      for (const task of stored) {
        try { await todoRequest('POST', { ...task, completedDates: task.completedDates ?? [] }); }
        catch (e) { if (!(e instanceof Error) || !e.message.includes('existiert bereits')) throw e; }
      }
      localStorage.removeItem(LEGACY_KEY); setLegacyCount(0); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Import fehlgeschlagen.'); }
  }

  function toggleCollapsed(key: string) {
    setCollapsed(prev => { const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]; writeStored(COLLAPSE_KEY, next); return next; });
  }
  function changeView(next: View) { setView(next); writeStored(VIEW_KEY, next); }

  // ——— Calendars ———
  // Appointments are fetched for a window around the shown month, so paging
  // through days and weeks needs no new request.
  const [calendar, setCalendar] = useState<{ feeds: CalendarFeed[]; events: CalendarEvent[] }>({ feeds: [], events: [] });
  const calFrom = addDays(startOfWeek(`${anchor.slice(0, 7)}-01`), -7);
  const calTo = addDays(calFrom, 63);
  const loadCalendar = useCallback(async () => {
    try {
      const res = await fetch(`/api/todo/calendar?from=${calFrom}&to=${calTo}`, { cache: 'no-store' });
      const result = await res.json();
      if (res.ok && result.ok) setCalendar({ feeds: result.feeds, events: result.events });
    } catch { /* calendars are extra; the planner works without them */ }
  }, [calFrom, calTo]);
  useEffect(() => {
    void loadCalendar();
    const onVisible = () => { if (document.visibilityState === 'visible') void loadCalendar(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadCalendar]);
  const feedOf = (event: CalendarEvent) => calendar.feeds.find(f => f.id === event.feedId);
  const eventsOn = (date: string) => calendar.events.filter(e => e.date === date);
  const timedEvents = (date: string, slot: Slot) => eventsOn(date).filter(e => e.time && slotForTime(e.time) === slot);

  // ——— Derived lists ———
  const sortTasks = useCallback((list: Task[], date?: string) => [...list].sort((a, b) => {
    const da = doneOn(a, date) && !settling.includes(a.id) ? 1 : 0;
    const db = doneOn(b, date) && !settling.includes(b.id) ? 1 : 0;
    if (da !== db) return da - db;
    if (a.time || b.time) return (a.time ? toMinutes(a.time) : 1e4) - (b.time ? toMinutes(b.time) : 1e4) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order;
    // Without a clock time, the more important task comes first.
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order;
  }), [settling]);
  const inSlot = (date: string, slot: Slot) => sortTasks(tasks.filter(t => occursOn(t, date) && t.slot === slot), date);
  const inbox = (p: Priority) => sortTasks(tasks.filter(t => !t.date && t.priority === p && (!t.done || settling.includes(t.id))));
  const completedInbox = tasks.filter(t => !t.date && t.done && !settling.includes(t.id));
  const dayStats = (date: string) => { const list = tasks.filter(t => occursOn(t, date)); return { total: list.length, open: list.filter(t => !doneOn(t, date)).length }; };

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    if (view === 'three') return [0, 1, 2].map(i => addDays(anchor, i));
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const start = startOfWeek(`${anchor.slice(0, 7)}-01`);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor, view]);

  // ——— Actions ———
  function openNew(date: string | null, slot: Slot = 'anytime', priority: Priority = 'none') {
    setEditing({ task: blankTask(date, slot, priority), isNew: true });
  }
  function saveTask(task: Task) {
    const exists = tasks.some(t => t.id === task.id);
    setTasks(prev => exists ? prev.map(t => t.id === task.id ? task : t) : [...prev, task]);
    const { deletedAt: _deleted, ...payload } = task;
    void write(exists ? 'PATCH' : 'POST', payload);
    setEditing(null);
  }
  function deleteTask(task: Task) {
    setTasks(prev => prev.filter(t => t.id !== task.id));
    void write('DELETE', { id: task.id });
    setEditing(null);
  }
  function toggleDone(task: Task, date?: string) {
    const occurrence = date && task.repeat !== 'none' ? date : undefined;
    const wasDone = doneOn(task, occurrence);
    const patch = occurrence
      ? { completedDates: wasDone ? task.completedDates.filter(d => d !== occurrence) : [...task.completedDates, occurrence] }
      : { done: !task.done };
    if (!wasDone) {
      setSettling(prev => [...prev, task.id]);
      window.setTimeout(() => setSettling(prev => prev.filter(id => id !== task.id)), reduce ? 0 : 750);
    }
    const next = tasks.map(t => t.id === task.id ? { ...t, ...patch } : t);
    setTasks(next);
    void write('PATCH', { id: task.id, ...patch });
    if (!wasDone && !reduce && date) {
      const list = next.filter(t => occursOn(t, date));
      if (list.length > 1 && list.every(t => doneOn(t, date))) void celebrate();
    }
  }
  async function celebrate() {
    const confetti = (await import('canvas-confetti')).default;
    confetti({ particleCount: 70, spread: 70, startVelocity: 32, origin: { y: 0.75 }, colors: ['#7ba888', '#9dc4a8', '#e8a33d', '#7d93b0'], disableForReducedMotion: true });
  }
  function quickAdd(date: string | null, slot: Slot, priority: Priority) {
    const title = quickText.trim(); if (!title) return;
    const base = blankTask(date, slot, priority);
    const peers = tasks.filter(t => t.date === date && (date ? t.slot === slot : t.priority === priority));
    const task = { ...base, title, ...taskAppearance(title), order: peers.length ? Math.max(...peers.map(t => t.order)) + 1 : base.order };
    setTasks(prev => [...prev, task]);
    void write('POST', task);
    setQuickText('');
  }
  function moveTask(taskId: string, date: string | null, slot: Slot, priority: Priority, beforeId?: string) {
    const peers = tasks.filter(t => t.id !== taskId && t.date === date && (date ? t.slot === slot : t.priority === priority)).sort((a, b) => a.order - b.order);
    let order = peers.length ? peers[peers.length - 1].order + 1 : 0;
    if (beforeId) {
      const index = peers.findIndex(t => t.id === beforeId);
      if (index === 0) order = peers[0].order - 1;
      else if (index > 0) order = (peers[index - 1].order + peers[index].order) / 2;
    }
    const current = tasks.find(t => t.id === taskId);
    const patch = date ? { date, slot, order, done: false } : { date, priority, order, done: false };
    if (current && current.date === patch.date && ('slot' in patch ? current.slot === patch.slot : current.priority === patch.priority) && !beforeId) return;
    // A clock time belongs to one section; dropping it elsewhere drops the time (the server does the same).
    if (date && current?.time && slotForTime(current.time) !== slot) Object.assign(patch, { time: null });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
    void write('PATCH', { id: taskId, ...patch });
  }
  function dropHandlers(key: string, date: string | null, slot: Slot, priority: Priority) {
    return {
      onDragOver: (e: DragEvent) => { e.preventDefault(); if (dropKey !== key) setDropKey(key); },
      onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setDropKey(null); },
      onDrop: (e: DragEvent) => { e.preventDefault(); if (dragId) moveTask(dragId, date, slot, priority); setDragId(null); setDropKey(null); },
    };
  }
  function shift(direction: number) {
    if (view === 'month') { const d = fromIso(anchor); d.setMonth(d.getMonth() + direction, 1); setAnchor(iso(d)); }
    else setAnchor(addDays(anchor, direction * (view === 'three' ? 3 : view === 'week' ? 7 : 1)));
  }
  function goToDay(date: string) {
    setDayDirection(date > anchor ? 1 : -1);
    setAnchor(date);
  }

  // ——— Pieces ———
  function readTarget(x: number, y: number): DropTarget | null {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]');
    if (!el) return null;
    const d = el.dataset;
    if (d.drop === 'task') {
      const target = tasks.find(t => t.id === d.taskId);
      return target ? { key: `task-${target.id}`, date: target.date, slot: target.slot, priority: target.priority, beforeId: target.id } : null;
    }
    if (d.drop === 'section') return { key: d.key!, date: d.date || null, slot: (d.slot || 'anytime') as Slot, priority: (d.priority || 'none') as Priority };
    if (d.drop === 'day') return { key: `day-${d.date}`, date: d.date!, keepSlot: true, slot: 'anytime', priority: 'none' };
    if (d.drop === 'inbox') return { key: 'inbox', date: null, slot: 'anytime', priority: 'none', keepPriority: true };
    return null;
  }

  function touchStart(task: Task, e: ReactTouchEvent) {
    if (!mobile || e.touches.length !== 1) return;
    const t = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-drop="task"]')!.getBoundingClientRect();
    const state = { task, timer: 0, x0: t.clientX, y0: t.clientY, dx: t.clientX - rect.left, dy: t.clientY - rect.top, width: rect.width, active: false, target: null as DropTarget | null, scroll: 0 };
    const cleanup = () => {
      window.clearTimeout(state.timer); cancelAnimationFrame(state.scroll);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
      touchRef.current = null;
    };
    const autoScroll = (y: number) => {
      cancelAnimationFrame(state.scroll);
      const edge = y < 110 ? -1 : y > window.innerHeight - 150 ? 1 : 0;
      if (!edge) return;
      const step = () => { window.scrollBy(0, edge * 9); state.scroll = requestAnimationFrame(step); };
      state.scroll = requestAnimationFrame(step);
    };
    function move(ev: TouchEvent) {
      const p = ev.touches[0];
      if (!state.active) {
        // Moving before the long-press fires means the finger is scrolling.
        if (Math.hypot(p.clientX - state.x0, p.clientY - state.y0) > 10) cleanup();
        return;
      }
      ev.preventDefault();
      setGhost(g => g && { ...g, x: p.clientX, y: p.clientY });
      const over = readTarget(p.clientX, p.clientY);
      state.target = over?.beforeId === task.id ? null : over;
      setDropKey(state.target?.key ?? null);
      autoScroll(p.clientY);
    }
    function end() {
      if (state.active) {
        const target = state.target;
        if (target) {
          const current = tasks.find(t => t.id === task.id) ?? task;
          if (target.beforeId !== task.id) moveTask(task.id, target.date, target.keepSlot ? current.slot : target.slot, target.keepPriority || target.date ? current.priority : target.priority, target.beforeId);
          if (target.key.startsWith('day-') && target.date) goToDay(target.date);
        }
        setGhost(null); setDragId(null); setDropKey(null);
        // The lift-off would otherwise land as a tap and open the editor.
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 350);
      }
      cleanup();
    }
    function cancel() {
      if (state.active) { setGhost(null); setDragId(null); setDropKey(null); }
      cleanup();
    }
    state.timer = window.setTimeout(() => {
      state.active = true;
      swipe.cancel();
      navigator.vibrate?.(12);
      setDragId(task.id);
      setGhost({ task, x: state.x0, y: state.y0, dx: state.dx, dy: state.dy, width: state.width });
    }, 380);
    touchRef.current = state;
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', cancel);
  }

  // ——— Now ———
  // Minutes since midnight of the planner day. Between 00:00 and 01:00 the
  // planner day is still yesterday, so the clock runs on past 24:00.
  const clock = clockDate.getHours() * 60 + clockDate.getMinutes() + (clockDate.getHours() < 1 ? 1440 : 0);
  const clockLabel = `${String(clockDate.getHours()).padStart(2, '0')}:${String(clockDate.getMinutes()).padStart(2, '0')}`;
  const timedToday = tasks.filter(t => t.time && occursOn(t, today) && !doneOn(t, today))
    .map(t => ({ task: t, start: toMinutes(t.time!), end: toMinutes(t.time!) + t.duration }))
    .sort((a, b) => a.start - b.start);
  const running = timedToday.find(t => t.start <= clock && clock < t.end);
  const upcoming = timedToday.find(t => t.start > clock);
  function liveOf(task: Task, date: string | undefined) {
    if (date !== today || !running || running.task.id !== task.id) return undefined;
    return { progress: (clock - running.start) / (running.end - running.start), remaining: running.end - clock };
  }
  const nowSlot: Slot = clock < 12 * 60 ? 'morning' : clock < 17 * 60 ? 'afternoon' : 'evening';
  function nowLine(key = 'now') {
    return <motion.div key={key} layout="position" className={styles.nowLine} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label={`Jetzt ${clockLabel}`}>
      <span className={styles.nowTime}>{clockLabel}</span><span className={styles.nowRule} />
    </motion.div>;
  }
  /** Tasks of a section with the calendar's appointments slotted in by time. */
  function entries(date: string, slot: Slot) {
    const list: ({ task: Task; event?: never } | { event: CalendarEvent; task?: never })[] = inSlot(date, slot).map(task => ({ task }));
    for (const event of timedEvents(date, slot)) {
      const at = toMinutes(event.time!);
      let index = list.findIndex(e => e.task && (!e.task.time || toMinutes(e.task.time) > at || (doneOn(e.task, date) && !settling.includes(e.task.id))));
      if (index === -1) index = list.length;
      list.splice(index, 0, { event });
    }
    return list;
  }
  /** Rows of a section with the now-line placed at the current time. */
  function withNowLine(list: ReturnType<typeof entries>, date: string, slot: Slot, size: 'lg' | 'sm') {
    const rows = list.map(e => e.task ? row(e.task, date, size) : eventRow(e.event, date, size));
    if (date !== today || slot !== nowSlot) return rows;
    let index = list.findIndex(e => e.task
      ? !e.task.time || (toMinutes(e.task.time) > clock && !(running?.task.id === e.task.id))
      : toMinutes(e.event.time!) > clock);
    if (index === -1) index = list.length;
    rows.splice(index, 0, nowLine());
    return rows;
  }
  function eventRow(event: CalendarEvent, date: string, size: 'lg' | 'sm') {
    const feed = feedOf(event);
    const start = toMinutes(event.time!);
    const live = date === today && start <= clock && clock < start + event.duration;
    return <EventRow key={event.id} event={event} feed={feed?.name ?? ''} tint={feedTint(feed?.color ?? 0)} size={size} live={live} />;
  }
  function allDayStrip(date: string) {
    const list = eventsOn(date).filter(e => !e.time);
    if (!list.length) return null;
    return <div key="allday" className={styles.allDay}>
      {list.map(e => <span key={e.id} className={styles.allDayChip} style={{ '--tint': feedTint(feedOf(e)?.color ?? 0) } as CSSProperties} title={e.title}><span>{e.title}</span></span>)}
    </div>;
  }
  function relative(minutes: number) {
    if (minutes < 60) return `${minutes} Min.`;
    const h = Math.floor(minutes / 60); const m = minutes % 60;
    return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
  }
  function nowCard() {
    const item = running ?? upcoming;
    if (!item) return null;
    const live = running ? (clock - running.start) / (running.end - running.start) : 0;
    return <motion.button key={item.task.id + (running ? '-run' : '-next')} className={`${styles.nowCard} ${running ? styles.nowCardLive : ''}`}
      initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} onClick={() => setEditing({ task: item.task, isNew: false })}>
      <TaskIcon emoji={item.task.emoji} theme={item.task.theme} size={44} />
      <span className={styles.nowCardText}>
        <small>{running ? `Jetzt · noch ${relative(running.end - clock)}` : `Als Nächstes · in ${relative(item.start - clock)}`}</small>
        <strong>{item.task.title}</strong>
        <span>{item.task.time}–{String(Math.floor(item.end / 60) % 24).padStart(2, '0')}:{String(item.end % 60).padStart(2, '0')}</span>
      </span>
      <span className={styles.nowClock}>{clockLabel}</span>
      {running && <span className={styles.nowProgress}><motion.i initial={false} animate={{ width: `${Math.min(100, live * 100)}%` }} transition={{ duration: 0.6 }} /></span>}
    </motion.button>;
  }

  function row(task: Task, date: string | undefined, size: 'lg' | 'sm' = 'lg') {
    return <TaskRow key={task.id} task={task} done={doneOn(task, date)} size={size} live={liveOf(task, date)} showPriority={Boolean(date)}
      dropTarget={dropKey === `task-${task.id}`}
      draggable={!mobile}
      lifted={ghost?.task.id === task.id}
      onTouchStart={e => touchStart(task, e)}
      onOpen={() => { if (suppressClick.current) return; setEditing({ task, isNew: false }); }}
      onToggle={() => toggleDone(task, date)}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); setDragId(task.id); }}
      onDragEnd={() => { setDragId(null); setDropKey(null); }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropKey(`task-${task.id}`); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragId && dragId !== task.id) moveTask(dragId, task.date, task.slot, task.priority, task.id); setDragId(null); setDropKey(null); }} />;
  }

  function quickComposer(key: string, date: string | null, slot: Slot, priority: Priority, label: string) {
    if (quick !== key) return <button className={styles.addLine} onClick={() => { setQuick(key); setQuickText(''); }}><IconPlus size={14} />{label}</button>;
    return <form className={styles.quickForm} onSubmit={e => { e.preventDefault(); quickAdd(date, slot, priority); }}>
      <input autoFocus aria-label="Neue Aufgabe" placeholder="Titel, Enter zum Speichern" value={quickText} onChange={e => setQuickText(e.target.value)}
        onBlur={() => { if (!quickText.trim()) setQuick(null); }} onKeyDown={e => { if (e.key === 'Escape') setQuick(null); }} />
      <button type="submit" aria-label="Aufgabe hinzufügen" disabled={!quickText.trim()}><IconPlus size={16} /></button>
    </form>;
  }

  // Sections are quiet labels, not blocks: an empty one is not shown at all,
  // except while a task is being dragged so every section can take the drop.
  function group(opts: { key: string; label: string; tint: string; icon: React.ReactNode; count: number; items: React.ReactNode; onAdd: () => void; drop?: ReturnType<typeof dropHandlers>; target?: { date: string | null; slot: Slot; priority: Priority }; footer?: React.ReactNode; size?: 'lg' | 'sm' }) {
    if (opts.count === 0 && !(dragId && opts.target)) return null;
    const collapseKey = opts.key.replace(/^\d{4}-\d{2}-\d{2}-/, 'slot-').replace(/^inbox-/, 'prio-');
    const open = !collapsed.includes(collapseKey) || Boolean(dragId);
    return <motion.section layout={reduce ? false : 'position'} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={`${styles.group} ${opts.size === 'sm' ? styles.groupSm : ''} ${dropKey === opts.key ? styles.groupDrop : ''}`} {...opts.drop}
      {...(opts.target ? { 'data-drop': 'section', 'data-key': opts.key, 'data-date': opts.target.date ?? '', 'data-slot': opts.target.slot, 'data-priority': opts.target.priority } : {})}>
      <div className={styles.groupHead} style={{ '--tint': opts.tint } as CSSProperties}>
        <button className={styles.label} onClick={() => toggleCollapsed(collapseKey)} aria-expanded={open}>
          <span className={styles.labelIcon}>{opts.icon}</span>{opts.label}
          {opts.count > 0 && <span className={styles.labelCount}>{opts.count}</span>}
          <motion.span className={styles.labelChevron} animate={{ rotate: open ? 0 : -90 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}><IconChevronDown size={13} /></motion.span>
        </button>
        <span className={styles.labelRule} aria-hidden />
        <button className={styles.labelAdd} onClick={opts.onAdd} aria-label={`Aufgabe zu ${opts.label} hinzufügen`}><IconPlus size={15} /></button>
      </div>
      <AnimatePresence initial={false}>
        {open && <motion.div className={styles.groupBody} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.24, ease: [0.4, 0, 0.2, 1] }}>
          <div className={styles.groupList}>
            <AnimatePresence initial={false}>{opts.items}</AnimatePresence>
            {opts.count === 0 && <div className={styles.dropHint}>Hierher ziehen</div>}
            {opts.footer}
          </div>
        </motion.div>}
      </AnimatePresence>
    </motion.section>;
  }

  function emptyState(text: string, onAdd: () => void) {
    return <motion.button key="empty" className={styles.emptyState} onClick={onAdd} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <span>{text}</span><span className={styles.plusDot}><IconPlus size={15} /></span>
    </motion.button>;
  }

  function daySlots(date: string, size: 'lg' | 'sm') {
    const total = tasks.filter(t => occursOn(t, date)).length + eventsOn(date).length;
    return <AnimatePresence initial={false}>
      {allDayStrip(date)}
      {SLOTS.map(slot => {
        const list = entries(date, slot);
        if (date === today && slot === nowSlot && list.length === 0 && total > 0 && !dragId) return <div key={slot}>{nowLine(`now-${slot}`)}</div>;
        return <div key={slot}>{group({
          key: `${date}-${slot}`, label: slotLabels[slot], tint: slotTint[slot], icon: <SlotIcon slot={slot} size={14} />,
          count: list.length, size, items: withNowLine(list, date, slot, size), target: { date, slot, priority: 'none' },
          onAdd: () => openNew(date, slot), drop: mobile ? undefined : dropHandlers(`${date}-${slot}`, date, slot, 'none'),
          footer: size === 'sm' && list.length > 0 ? quickComposer(`${date}-${slot}`, date, slot, 'none', 'Hier hinzufügen') : undefined,
        })}</div>;
      })}
      {total === 0 && !dragId && emptyState(date === today ? 'Heute ist noch nichts geplant' : 'Nichts geplant', () => openNew(date))}
      {total > 0 && size === 'lg' && <button key="add" className={styles.addDay} onClick={() => openNew(date)}><IconPlus size={15} />Aufgabe hinzufügen</button>}
    </AnimatePresence>;
  }

  function todoGroups(size: 'lg' | 'sm') {
    const open = tasks.filter(t => !t.date && !t.done).length;
    return <AnimatePresence initial={false}>
      {PRIORITIES.map(p => {
        const list = inbox(p);
        return <div key={p}>{group({
          key: `inbox-${p}`, label: p === 'none' ? 'Später' : priorityLabels[p], tint: priorityTint[p], icon: <IconPriority level={p} size={10} />,
          count: list.length, size, items: list.map(t => row(t, undefined, size)), target: { date: null, slot: 'anytime', priority: p },
          onAdd: () => openNew(null, 'anytime', p), drop: mobile ? undefined : dropHandlers(`inbox-${p}`, null, 'anytime', p),
          footer: size === 'sm' && list.length > 0 ? quickComposer(`inbox-${p}`, null, 'anytime', p, 'Aufgabe hinzufügen') : undefined,
        })}</div>;
      })}
      {open === 0 && !dragId && emptyState('Alles erledigt – neue Aufgabe?', () => openNew(null))}
      {completedInbox.length > 0 && <div key="done">{group({
        key: 'done', label: 'Erledigt', tint: 'var(--success)', icon: <IconPriority level="none" size={10} />, count: completedInbox.length, size,
        items: completedInbox.sort((x, y) => y.order - x.order).map(t => row(t, undefined, size)), onAdd: () => openNew(null),
      })}</div>}
    </AnimatePresence>;
  }

  // ——— Render ———
  if (!loaded) return <main className={styles.shell}><div className={styles.skeleton}>{[0, 1, 2, 3].map(i => <div key={i} />)}</div></main>;

  const banners = <>
    {error && <div className="notice notice--error" role="alert"><span>{error}</span><button className="btn-sm" onClick={() => void load()}>Neu laden</button></div>}
    {legacyCount > 0 && <div className="notice notice--warn"><span>{legacyCount} Aufgaben aus dem lokalen Probelauf gefunden.</span><button className="btn-sm" onClick={() => void importLegacy()}>Übernehmen</button><button className="btn-sm" onClick={() => { localStorage.removeItem(LEGACY_KEY); setLegacyCount(0); }}>Verwerfen</button></div>}
  </>;

  const sheet = <AnimatePresence>
    {editing && <TaskSheet key={editing.task.id} task={editing.task} isNew={editing.isNew} today={today} mobile={mobile} pushOn={push.state === 'on'}
      onSave={saveTask} onDelete={() => deleteTask(editing.task)} onClose={() => setEditing(null)} />}
  </AnimatePresence>;

  if (mobile) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const onSwipe = (_: unknown, info: PanInfo) => {
      if (Math.abs(info.offset.x) < 70 || Math.abs(info.offset.x) < Math.abs(info.offset.y)) return;
      goToDay(addDays(anchor, info.offset.x < 0 ? 1 : -1));
    };
    const onWeekSwipe = (_: unknown, info: PanInfo) => {
      if (Math.abs(info.offset.x) < 50) return;
      goToDay(addDays(anchor, info.offset.x < 0 ? 7 : -7));
    };
    return <main className={styles.shell}>
      <header className={styles.mTop}>
        <nav aria-label="Ansicht">
          <AnimatedTabs<MobileTab> value={tab} onChange={setTab} tabs={[
            { value: 'day', label: 'Tag', ...(tab === 'todo' ? { 'data-drop': 'day', 'data-date': anchor } : {}) },
            { value: 'todo', label: 'To-do', className: dropKey === 'inbox' ? styles.mTabDrop : undefined, ...(tab === 'day' ? { 'data-drop': 'inbox' } : {}) },
          ]} />
        </nav>
        <div className={styles.actionPill}>
          <CalendarButton className={styles.actionButton} feeds={calendar.feeds} onChange={() => void loadCalendar()} />
          <PushButton className={styles.actionButton} />
          <button className={styles.actionButton} onClick={() => openNew(tab === 'day' ? anchor : null, 'anytime')} aria-label="Neue Aufgabe"><IconPlus size={21} /></button>
        </div>
      </header>
      {banners}

      <AnimatePresence mode="wait" initial={false}>
        {tab === 'day' ? <motion.div key="day" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: reduce ? 0 : 0.18 }}>
          <div className={styles.mDayHead}>
            <h1>{anchor === today ? 'Heute' : fmtWeekdayLong.format(fromIso(anchor))}</h1>
            <button className={styles.mMonth} onClick={() => goToDay(today)} disabled={anchor === today}>
              {anchor === today ? fmtMonth.format(fromIso(anchor)) : 'Zu heute'}<IconChevronRight size={15} />
            </button>
          </div>
          <motion.div className={styles.week} drag={reduce || ghost ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25} onDragEnd={onWeekSwipe}>
            {week.map(date => {
              const stats = dayStats(date);
              return <button key={date} data-drop="day" data-date={date} className={`${styles.weekDay} ${date === today ? styles.weekToday : ''} ${dropKey === `day-${date}` ? styles.weekDrop : ''}`} onClick={() => goToDay(date)} aria-pressed={date === anchor} aria-label={`${fmtWeekdayLong.format(fromIso(date))}, ${fromIso(date).getDate()}.`}>
                {date === anchor && <motion.span layoutId="weekSel" className={styles.weekSel} transition={{ type: 'spring', stiffness: 480, damping: 34 }} />}
                <span className={styles.weekInitial}>{weekdayInitial(date)}</span>
                <strong>{fromIso(date).getDate()}</strong>
                <span className={`${styles.weekDot} ${stats.total ? (stats.open ? styles.weekDotOpen : styles.weekDotDone) : ''}`} />
              </button>;
            })}
          </motion.div>
          {anchor === today && nowCard()}
          <AnimatePresence mode="popLayout" initial={false} custom={dayDirection}>
            <motion.div key={anchor} className={styles.mSections} custom={dayDirection}
              initial={reduce ? false : { opacity: 0, x: dayDirection * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dayDirection * -40 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              drag={reduce || ghost ? false : 'x'} dragListener={false} dragControls={swipe} onPointerDown={e => { if (!ghost) swipe.start(e); }}
              dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} onDragEnd={onSwipe}>
              {daySlots(anchor, 'lg')}
            </motion.div>
          </AnimatePresence>
        </motion.div>
        : <motion.div key="todo" className={styles.mSections} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: reduce ? 0 : 0.18 }}>
          <div className={styles.mDayHead}><h1>To-do</h1><span className={styles.mSub}>{tasks.filter(t => !t.date && !t.done).length} ohne Termin</span></div>
          {todoGroups('lg')}
        </motion.div>}
      </AnimatePresence>
      {sheet}
      {ghost && createPortal(<motion.div className={styles.ghost} style={{ left: ghost.x - ghost.dx, top: ghost.y - ghost.dy, width: ghost.width }}
        initial={{ scale: 1 }} animate={{ scale: 1.04, rotate: -1.2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
        <TaskIcon emoji={ghost.task.emoji} theme={ghost.task.theme} size={42} />
        <span>{ghost.task.title}</span>
      </motion.div>, document.body)}
    </main>;
  }

  // ——— Desktop ———
  const todayStats = dayStats(today);
  return <main className={styles.shell}>
    <header className={styles.top}>
      <div>
        <h1 className="h1">Planer</h1>
        <p className="text-secondary text-sm mt-1">{fmtWeekdayLong.format(fromIso(today))} · {todayStats.total ? `${todayStats.total - todayStats.open} von ${todayStats.total} heute erledigt` : 'Heute noch nichts geplant'}</p>
      </div>
      <div className={styles.topRight}>
      <CalendarButton className={`btn-ghost ${styles.iconOnly}`} feeds={calendar.feeds} onChange={() => void loadCalendar()} />
      <PushButton className={`btn-ghost ${styles.iconOnly}`} />
      <div className="control-row">
        <button className="btn-ghost" onClick={() => setAnchor(today)} disabled={anchor === today}>Heute</button>
        <div className={styles.navPair}>
          <button onClick={() => shift(-1)} aria-label="Zurück"><IconChevronLeft size={18} /></button>
          <span>{fmtMonth.format(fromIso(anchor))}</span>
          <button onClick={() => shift(1)} aria-label="Weiter"><IconChevronRight size={18} /></button>
        </div>
        <AnimatedTabs<View> tabs={[{ value: 'day', label: 'Tag' }, { value: 'three', label: '3 Tage' }, { value: 'week', label: 'Woche' }, { value: 'month', label: 'Monat' }]} value={view} onChange={changeView} />
        <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => openNew(anchor)}><IconPlus size={17} />Aufgabe</button>
      </div>
      </div>
    </header>
    {banners}

    <div className={styles.board}>
      <aside className={styles.inbox} aria-label="To-do-Liste">
        <div className={styles.inboxHead}><h2 className="h2">To-do</h2><span>{tasks.filter(t => !t.date && !t.done).length} ohne Termin</span></div>
        <div className={styles.inboxScroll}>{todoGroups('sm')}</div>
      </aside>

      <section className={styles.calendar} aria-label="Tagesplanung">
        {view === 'month'
          ? <div className={styles.month}>
            {days.slice(0, 7).map(d => <span key={`h-${d}`} className={styles.monthHead}>{fmtWeekdayShort.format(fromIso(d)).replace('.', '')}</span>)}
            {days.map(date => {
              const list = sortTasks(tasks.filter(t => occursOn(t, date)), date);
              const appointments = eventsOn(date);
              const shown = Math.max(0, 3 - appointments.length);
              const more = Math.max(0, appointments.length - 3) + Math.max(0, list.length - shown);
              return <button key={date} className={`${styles.monthDay} ${date.slice(0, 7) !== anchor.slice(0, 7) ? styles.monthOut : ''} ${date === today ? styles.monthToday : ''}`} onClick={() => { setAnchor(date); changeView('day'); }}>
                <span className={styles.monthNum}>{fromIso(date).getDate()}</span>
                {appointments.slice(0, 3).map(e => <span key={e.id} className={`${styles.monthTask} ${styles.monthEvent}`} style={{ '--tint': feedTint(feedOf(e)?.color ?? 0) } as CSSProperties}>{e.time && <b>{e.time}</b>}{e.title}</span>)}
                {list.slice(0, shown).map(t => <span key={t.id} className={`${styles.monthTask} ${doneOn(t, date) ? styles.monthTaskDone : ''}`}><b>{t.emoji}</b>{t.title}</span>)}
                {more > 0 && <small>+{more} weitere</small>}
              </button>;
            })}
          </div>
          : <div className={`${styles.columns} ${view === 'day' ? styles.columnsOne : ''} ${view === 'week' ? styles.columnsWeek : ''}`}>
            {days.map(date => {
              const stats = dayStats(date);
              return <article key={date} className={styles.column}>
                <div className={`${styles.columnHead} ${date === today ? styles.columnToday : ''}`}>
                  <span>{fmtWeekdayShort.format(fromIso(date)).replace('.', '')}</span><strong>{fromIso(date).getDate()}</strong>
                  <small>{stats.total ? `${stats.open} offen` : ''}</small>
                </div>
                <div className={styles.columnBody}>{daySlots(date, 'sm')}</div>
              </article>;
            })}
          </div>}
      </section>
    </div>
    {sheet}
  </main>;
}
