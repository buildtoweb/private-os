import type { Slot, Task } from './types';

// Shared between the planner, the agent API and the reminder cron so that
// "is this task on that day" means the same thing everywhere.

export const TIME_ZONE = 'Europe/Vienna';

/** When a task without its own time starts, per section of the day. */
export const SLOT_START: Record<Slot, string> = {
  anytime: '09:00',
  morning: '08:00',
  afternoon: '13:00',
  evening: '18:00',
};

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function occursOn(task: Pick<Task, 'date' | 'repeat'>, date: string) {
  if (!task.date || date < task.date) return false;
  if (task.date === date) return true;
  if (task.repeat === 'daily') return true;
  const a = parts(task.date);
  const b = parts(date);
  if (task.repeat === 'weekly') return a.getUTCDay() === b.getUTCDay();
  if (task.repeat === 'monthly') {
    // On the 31st, shorter months fall on their last day instead of being skipped.
    const lastDay = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
    return Math.min(a.getUTCDate(), lastDay) === b.getUTCDate();
  }
  return false;
}

export function doneOn(task: Pick<Task, 'repeat' | 'done' | 'completedDates'>, date?: string) {
  return date && task.repeat !== 'none' ? task.completedDates.includes(date) : task.done;
}

export function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** The section of the day a clock time belongs to: before 12 Vormittag, before 17 Nachmittag, then Abend. */
export function slotForTime(time: string): Slot {
  const minutes = toMinutes(time);
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 17 * 60) return 'afternoon';
  return 'evening';
}

export function startTime(task: Pick<Task, 'time' | 'slot'>) {
  return task.time ?? SLOT_START[task.slot];
}

/** Date and minute-of-day right now in Vienna. */
export function viennaNow(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => f.find(p => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
