// The durable part of the to-do reminders (see lib/todo/reminders.ts).
//
// Workflow functions run in a sandbox, so this file imports nothing but
// `workflow` at the top level; everything touching Node, Supabase or Web Push
// is loaded inside the steps, which run as ordinary server code.
import { sleep } from 'workflow';

type Result = { current: boolean; sent: boolean; reason: string; delivered?: number; failed?: number };

export async function todoReminderWorkflow(taskId: string, date: string, fireAt: string) {
  'use workflow';
  await sleep(new Date(fireAt));
  const result = await deliverReminder(taskId, date, fireAt);
  // Only the run that matches the task's current schedule continues the chain.
  if (result.current) await scheduleFollowing(taskId, date);
  return result;
}

async function deliverReminder(taskId: string, date: string, fireAt: string): Promise<Result> {
  'use step';
  const { claimReminder, getTask, listTasks } = await import('./store');
  const { doneOn, occursOn, startTime, toMinutes, viennaNow } = await import('./schedule');
  const { fireInstant } = await import('./reminders');
  const { sendDashboardPush } = await import('@/lib/push');

  const task = await getTask(taskId).catch(() => null);
  if (!task) return { current: false, sent: false, reason: 'gone' };
  if (task.reminder === null || !occursOn(task, date) || fireInstant(task, date).toISOString() !== fireAt) {
    return { current: false, sent: false, reason: 'rescheduled' };
  }
  if (doneOn(task, date)) return { current: true, sent: false, reason: 'done' };
  // A run that wakes far too late (an outage) stays silent rather than nag.
  if (Date.now() - Date.parse(fireAt) > 45 * 60_000) return { current: true, sent: false, reason: 'late' };
  if (!(await claimReminder(taskId, date))) return { current: true, sent: false, reason: 'already-sent' };

  const start = startTime(task);
  const lead = Math.max(0, toMinutes(start) - viennaNow().minutes);
  const leadText = lead === 0 ? 'Jetzt' : lead < 60 ? `In ${lead} Min.` : `In ${Math.floor(lead / 60)} Std.${lead % 60 ? ` ${lead % 60} Min.` : ''}`;
  const open = (await listTasks()).filter(t => occursOn(t, date) && !doneOn(t, date)).length;
  const push = await sendDashboardPush({
    title: `${task.emoji} ${task.title}`,
    body: `${leadText} · ${task.time ? `${start} · ` : ''}${task.duration} Min.`,
    url: `/todo?task=${task.id}`,
    tag: `todo-${task.id}-${date}`,
    badgeCount: open,
  });
  return { current: true, sent: push.delivered > 0, reason: push.delivered > 0 ? 'sent' : 'no-device', delivered: push.delivered, failed: push.failed };
}

async function scheduleFollowing(taskId: string, date: string) {
  'use step';
  const { getTask } = await import('./store');
  const { fireInstant, nextReminder } = await import('./reminders');
  const { start } = await import('workflow/api');
  const task = await getTask(taskId).catch(() => null);
  if (!task || task.repeat === 'none') return null;
  const next = nextReminder(task, new Date(fireInstant(task, date).getTime() + 60_000));
  if (!next) return null;
  const run = await start(todoReminderWorkflow, [task.id, next.date, next.fireAt.toISOString()]);
  return run.runId;
}
