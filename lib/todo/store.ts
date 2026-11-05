import { randomUUID } from 'node:crypto';
import { supa } from '@/lib/supabase';
import type { Priority, Repeat, Slot, Subtask, Task, Theme } from './types';
import { taskAppearance } from './appearance';
import { appToday } from '@/lib/date';
import { slotForTime } from './schedule';

const priorities = ['high', 'medium', 'low', 'none'] as const;
const slots = ['anytime', 'morning', 'afternoon', 'evening'] as const;
const repeats = ['none', 'daily', 'weekly', 'monthly'] as const;
const themes = ['work', 'finance', 'creative', 'health', 'home', 'learning', 'general'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed = new Set(['id', 'title', 'priority', 'date', 'slot', 'time', 'duration', 'repeat', 'reminder', 'notes', 'subtasks', 'done', 'completedDates', 'order', 'emoji', 'theme']);
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

export class TodoError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

type Row = {
  id: string; title: string; priority: Priority; scheduled_date: string | null; slot: Slot;
  duration: number; recurrence: Repeat; notes: string; subtasks: Subtask[]; done: boolean;
  completed_dates: string[]; sort_order: number; emoji: string; theme: Theme; deleted_at: string | null;
  start_time: string | null; reminder: number | null; reminded_dates: string[];
};

function toTask(row: Row): Task {
  return { id: row.id, title: row.title, priority: row.priority, date: row.scheduled_date,
    // Rows saved before the time decided the section get it from the time here.
    slot: row.start_time ? slotForTime(row.start_time) : row.slot, time: row.start_time ?? null, duration: row.duration, repeat: row.recurrence,
    reminder: row.reminder ?? null, notes: row.notes,
    subtasks: row.subtasks, done: row.done, completedDates: row.completed_dates,
    order: row.sort_order, emoji: row.emoji, theme: row.theme, deletedAt: row.deleted_at };
}

function validDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TodoError('invalid_date', `${field} muss YYYY-MM-DD sein.`);
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw new TodoError('invalid_date', `${field} ist kein gültiges Datum.`);
  return value;
}

function validId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new TodoError('invalid_id', 'id muss eine UUID sein.');
  return value;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new TodoError('invalid_param', `${field} ist ungültig. Erlaubt: ${values.join(', ')}.`);
  return value as T;
}

function validate(input: unknown, create: boolean): Partial<Task> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TodoError('invalid_body', 'Ein JSON-Objekt ist erforderlich.');
  const raw = input as Record<string, unknown>;
  const unknown = Object.keys(raw).filter(k => !allowed.has(k));
  if (unknown.length) throw new TodoError('unknown_field', `Unbekannte Felder: ${unknown.join(', ')}.`);
  const out: Partial<Task> = {};
  if ('id' in raw) { if (!create) throw new TodoError('unknown_field', 'id kann nicht geändert werden.'); out.id = validId(raw.id); }
  if ('title' in raw || create) {
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.trim().length > 300) throw new TodoError('invalid_param', 'title muss 1–300 Zeichen haben.');
    out.title = raw.title.trim();
  }
  if ('priority' in raw) out.priority = enumValue(raw.priority, priorities, 'priority');
  if ('date' in raw) out.date = raw.date === null ? null : validDate(raw.date, 'date');
  if ('slot' in raw) out.slot = enumValue(raw.slot, slots, 'slot');
  if ('time' in raw) {
    if (raw.time !== null && (typeof raw.time !== 'string' || !clock.test(raw.time))) throw new TodoError('invalid_param', 'time muss HH:MM (24h) oder null sein.');
    out.time = raw.time as string | null;
  }
  if ('reminder' in raw) {
    if (raw.reminder !== null && (!Number.isInteger(raw.reminder) || (raw.reminder as number) < 0 || (raw.reminder as number) > 1440)) throw new TodoError('invalid_param', 'reminder muss Minuten 0–1440 vor dem Start oder null sein.');
    out.reminder = raw.reminder as number | null;
  }
  if ('duration' in raw) {
    if (!Number.isInteger(raw.duration) || (raw.duration as number) < 1 || (raw.duration as number) > 1440) throw new TodoError('invalid_param', 'duration muss eine ganze Zahl von 1–1440 sein.');
    out.duration = raw.duration as number;
  }
  if ('repeat' in raw) out.repeat = enumValue(raw.repeat, repeats, 'repeat');
  if ('notes' in raw) {
    if (typeof raw.notes !== 'string' || raw.notes.length > 20_000) throw new TodoError('invalid_param', 'notes darf höchstens 20.000 Zeichen haben.');
    out.notes = raw.notes;
  }
  if ('subtasks' in raw) {
    if (!Array.isArray(raw.subtasks) || raw.subtasks.length > 100 || !raw.subtasks.every(s => s && typeof s === 'object' && typeof s.id === 'string' && s.id.length <= 100 && typeof s.title === 'string' && s.title.trim().length > 0 && s.title.length <= 300 && typeof s.done === 'boolean')) throw new TodoError('invalid_param', 'subtasks muss eine Liste mit höchstens 100 gültigen Schritten sein.');
    out.subtasks = raw.subtasks.map(s => ({ id: s.id, title: s.title.trim(), done: s.done }));
  }
  if ('done' in raw) { if (typeof raw.done !== 'boolean') throw new TodoError('invalid_param', 'done muss boolean sein.'); out.done = raw.done; }
  if ('completedDates' in raw) {
    if (!Array.isArray(raw.completedDates) || raw.completedDates.length > 3660) throw new TodoError('invalid_param', 'completedDates muss eine Datumsliste sein.');
    out.completedDates = [...new Set(raw.completedDates.map(value => validDate(value, 'completedDates')))];
  }
  if ('order' in raw) {
    if (typeof raw.order !== 'number' || !Number.isFinite(raw.order) || Math.abs(raw.order) > 1e15) throw new TodoError('invalid_param', 'order muss eine endliche Zahl sein.');
    out.order = raw.order;
  }
  if ('emoji' in raw) { if (typeof raw.emoji !== 'string' || raw.emoji.length > 20) throw new TodoError('invalid_param', 'emoji ist ungültig.'); out.emoji = raw.emoji; }
  if ('theme' in raw) out.theme = enumValue(raw.theme, themes, 'theme');
  return out;
}

function toColumns(task: Partial<Task>) {
  const row: Record<string, unknown> = {};
  if (task.id !== undefined) row.id = task.id;
  if (task.title !== undefined) row.title = task.title;
  if (task.priority !== undefined) row.priority = task.priority;
  if (task.date !== undefined) row.scheduled_date = task.date;
  if (task.slot !== undefined) row.slot = task.slot;
  if (task.time !== undefined) row.start_time = task.time;
  if (task.reminder !== undefined) row.reminder = task.reminder;
  if (task.duration !== undefined) row.duration = task.duration;
  if (task.repeat !== undefined) row.recurrence = task.repeat;
  if (task.notes !== undefined) row.notes = task.notes;
  if (task.subtasks !== undefined) row.subtasks = task.subtasks;
  if (task.done !== undefined) row.done = task.done;
  if (task.completedDates !== undefined) row.completed_dates = task.completedDates;
  if (task.order !== undefined) row.sort_order = task.order;
  if (task.emoji !== undefined) row.emoji = task.emoji;
  if (task.theme !== undefined) row.theme = task.theme;
  return row;
}

/**
 * Unfinished one-off tasks from past days move to today, keeping their slot and
 * time, so nothing silently disappears into yesterday. Recurring tasks are left
 * alone — their next occurrence comes anyway. Idempotent; runs on every read.
 */
export async function rollOverTasks(today = appToday()): Promise<string[]> {
  const { data, error } = await supa().from('todo_tasks')
    .update({ scheduled_date: today, reminded_dates: [], updated_at: new Date().toISOString() })
    .is('deleted_at', null).eq('done', false).eq('recurrence', 'none').lt('scheduled_date', today)
    .select('id');
  if (error) throw error;
  const ids = (data ?? []).map((row: { id: string }) => row.id);
  if (ids.length) await scheduleMany(ids);
  return ids;
}

export async function listTasks(includeDeleted = false): Promise<Task[]> {
  const result: Task[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supa().from('todo_tasks').select('*').order('created_at', { ascending: true }).range(from, from + 999);
    if (!includeDeleted) query = query.is('deleted_at', null);
    const { data, error } = await query;
    if (error) throw error;
    result.push(...(data as Row[]).map(toTask));
    if (!data || data.length < 1000) break;
  }
  return result;
}

export async function getTask(id: string, includeDeleted = false): Promise<Task> {
  let query = supa().from('todo_tasks').select('*').eq('id', validId(id));
  if (!includeDeleted) query = query.is('deleted_at', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new TodoError('todo_not_found', 'Aufgabe nicht gefunden.', 404);
  return toTask(data as Row);
}

export async function createTask(input: unknown): Promise<Task> {
  const values = validate(input, true);
  const art = taskAppearance(values.title!);
  // A task with a clock time reminds at its start unless the caller says otherwise.
  if (values.time && values.reminder === undefined) values.reminder = 0;
  if (values.time) values.slot = slotForTime(values.time);
  const { data, error } = await supa().from('todo_tasks').insert({ ...toColumns(values), emoji: values.emoji ?? art.emoji, theme: values.theme ?? art.theme, id: values.id ?? randomUUID() }).select('*').single();
  if (error?.code === '23505') throw new TodoError('todo_exists', 'Aufgabe mit dieser id existiert bereits.', 409);
  if (error) throw error;
  const task = toTask(data as Row);
  await schedule(task);
  return task;
}

export async function updateTask(id: string, input: unknown): Promise<Task> {
  const values = validate(input, false);
  if (!Object.keys(values).length) throw new TodoError('nothing_to_update', 'Keine Änderungen angegeben.');
  const scheduling = (['date', 'slot', 'time', 'reminder', 'repeat'] as const).filter(k => k in values);
  const current = values.title !== undefined || scheduling.length ? await getTask(id) : null;
  // A clock time decides the section of the day. Moving a timed task into a
  // section its time doesn't belong to drops the time instead.
  if (values.time) values.slot = slotForTime(values.time);
  else if (values.time === undefined && values.slot && current?.time && slotForTime(current.time) !== values.slot) values.time = null;
  const columns = toColumns(values);
  // A renamed task keeps a hand-picked icon, but an automatic one follows the title.
  if (current && values.title !== undefined && values.emoji === undefined
    && (current.emoji === taskAppearance(current.title).emoji || current.emoji === legacyEmoji(current.title))) {
    const art = taskAppearance(values.title);
    columns.emoji = art.emoji;
    if (values.theme === undefined) columns.theme = art.theme;
  }
  // Actually rescheduling re-arms the reminder for the new time.
  const rescheduled = Boolean(current && scheduling.some(k => values[k] !== current[k]));
  if (rescheduled) columns.reminded_dates = [];
  const { data, error } = await supa().from('todo_tasks').update({ ...columns, updated_at: new Date().toISOString() }).eq('id', validId(id)).is('deleted_at', null).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new TodoError('todo_not_found', 'Aufgabe nicht gefunden.', 404);
  const task = toTask(data as Row);
  if (rescheduled) await schedule(task);
  return task;
}

// Reminders are scheduled as sleeping workflow runs (lib/todo/reminders.ts).
// Loaded lazily: that module imports this one. A failure to schedule must never
// fail the save itself — the daily safety net picks the task up again.
async function schedule(task: Task) {
  if (task.reminder === null || !task.date) return;
  try { await (await import('./reminders')).scheduleReminder(task); }
  catch (error) { console.error('todo reminder scheduling failed', error instanceof Error ? error.message : error); }
}
async function scheduleMany(ids: string[]) {
  for (const id of ids) {
    try { await schedule(await getTask(id)); } catch { /* skipped; retried by the daily run */ }
  }
}

// The first planner version picked from seven emoji by keyword; tasks created
// then still carry that pick and count as "automatic".
function legacyEmoji(title: string) {
  const t = title.toLocaleLowerCase('de');
  const rules: [RegExp, string][] = [
    [/finanz|geld|rechn|budget|steuer|bank|versicher|zahl|spar|invest/, '💰'],
    [/video|film|foto|design|zeichnen|malen|musik|schreib|post|content/, '🎨'],
    [/sport|lauf|jog|gym|training|arzt|gesund|medit|yoga|spazier/, '💪'],
    [/einkauf|kochen|essen|küche|putz|wäsche|haus|wohnung|pflanz/, '🏡'],
    [/lern|les|buch|kurs|stud|sprache|wissen/, '📚'],
    [/mail|meeting|anruf|angebot|projekt|arbeit|code|website|dashboard|termin/, '💼'],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? '✨';
}

/** Every live task that has a reminder and a date (the daily safety net). */
export async function tasksWithReminders(): Promise<Task[]> {
  const { data, error } = await supa().from('todo_tasks').select('*')
    .is('deleted_at', null).not('reminder', 'is', null).not('scheduled_date', 'is', null);
  if (error) throw error;
  return (data as Row[]).map(toTask);
}

/**
 * Marks the reminder for `date` as sent — exactly once. Several sleeping
 * workflow runs can wake for the same occurrence (a task saved twice, the
 * daily safety net); compare-and-set on reminded_dates lets only one win.
 */
export async function claimReminder(id: string, date: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supa().from('todo_tasks').select('reminded_dates').eq('id', validId(id)).maybeSingle();
    if (error) throw error;
    const previous: string[] = (data as { reminded_dates: string[] } | null)?.reminded_dates ?? [];
    if (previous.includes(date)) return false;
    const next = [...previous, date].sort().slice(-14);
    const { data: won, error: casError } = await supa().from('todo_tasks').update({ reminded_dates: next })
      .eq('id', id).filter('reminded_dates', 'eq', `{${previous.join(',')}}`).select('id');
    if (casError) throw casError;
    if (won?.length) return true;
  }
  return false;
}

export async function deleteTask(id: string): Promise<void> {
  const { data, error } = await supa().from('todo_tasks').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', validId(id)).is('deleted_at', null).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new TodoError('todo_not_found', 'Aufgabe nicht gefunden.', 404);
}

export async function restoreTask(id: string): Promise<Task> {
  const { data, error } = await supa().from('todo_tasks').update({ deleted_at: null, updated_at: new Date().toISOString() }).eq('id', validId(id)).not('deleted_at', 'is', null).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new TodoError('todo_not_found', 'Gelöschte Aufgabe nicht gefunden.', 404);
  return toTask(data as Row);
}
