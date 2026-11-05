// Push reminders without polling.
//
// Saving a task with a reminder starts a durable workflow run that sleeps until
// the reminder is due (Vercel Workflow: a sleeping run costs nothing). When it
// wakes it re-reads the task (lib/todo/reminder-workflow.ts), so edits made in the meantime win:
//
//   * moved, retimed or reminder switched off → the run is stale and exits
//     (the save that changed it already started a fresh run)
//   * done or deleted → nothing is sent
//   * otherwise one push, claimed atomically so duplicate runs send once
//
// A repeating task then schedules its next occurrence. A daily cron
// (/api/cron/todo-reminders) is the safety net: it rolls unfinished tasks over
// and re-schedules the day's reminders in case a run was ever lost.
import { start } from 'workflow/api';
import { appToday } from '@/lib/date';
import { doneOn, occursOn, startTime, toMinutes, TIME_ZONE } from './schedule';
import type { Task } from './types';
import { todoReminderWorkflow } from './reminder-workflow';

/** UTC instant of a wall-clock time in Vienna. */
export function viennaInstant(date: string, minutes: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  // Date.UTC carries overflow, so a time before midnight (negative minutes) works.
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const asVienna = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (asVienna - guess));
}

function addDay(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** When the reminder for one occurrence of a task fires. */
export function fireInstant(task: Task, date: string): Date {
  return viennaInstant(date, toMinutes(startTime(task)) - (task.reminder ?? 0));
}

/** The next occurrence whose reminder is still ahead, if any (looks a year out). */
export function nextReminder(task: Task, now = new Date()): { date: string; fireAt: Date } | null {
  if (task.reminder === null || !task.date || task.deletedAt) return null;
  if (task.repeat === 'none') {
    const fireAt = fireInstant(task, task.date);
    return !task.done && fireAt > now ? { date: task.date, fireAt } : null;
  }
  const yesterday = addDay(appToday(), -1);
  let day = task.date > yesterday ? task.date : yesterday;
  for (let i = 0; i < 400; i++, day = addDay(day, 1)) {
    if (!occursOn(task, day) || doneOn(task, day)) continue;
    const fireAt = fireInstant(task, day);
    if (fireAt > now) return { date: day, fireAt };
  }
  return null;
}

export async function scheduleReminder(task: Task) {
  const next = nextReminder(task);
  if (!next) return null;
  const run = await start(todoReminderWorkflow, [task.id, next.date, next.fireAt.toISOString()]);
  return { runId: run.runId, ...next };
}
