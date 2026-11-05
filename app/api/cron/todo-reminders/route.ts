// Daily safety net for to-do push reminders.
//
// Reminders are delivered by sleeping workflow runs that each save starts
// (lib/todo/reminders.ts) — nothing polls. This route runs once a day from
// Vercel Cron, after the planner day turns over at 01:00: it rolls unfinished
// tasks over to the new day (which schedules them) and re-schedules every
// reminder due in the next 26 hours, in case a run was ever lost. Duplicate
// runs are harmless: delivery is claimed atomically per occurrence.
//
// Auth: Vercel Cron's `Authorization: Bearer $CRON_SECRET`, or
// `x-notify-secret: $NOTIFY_WEBHOOK_SECRET` for a manual call.
import { NextRequest, NextResponse } from 'next/server';
import { isPushConfigured } from '@/lib/push';
import { nextReminder, scheduleReminder } from '@/lib/todo/reminders';
import { rollOverTasks, tasksWithReminders } from '@/lib/todo/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HORIZON_MS = 26 * 60 * 60 * 1000;

function authorized(req: NextRequest) {
  const cron = process.env.CRON_SECRET;
  const notify = process.env.NOTIFY_WEBHOOK_SECRET;
  if (cron && req.headers.get('authorization') === `Bearer ${cron}`) return true;
  if (notify && req.headers.get('x-notify-secret') === notify) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ ok: false, error: 'VAPID_NOT_CONFIGURED' }, { status: 503 });

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  try {
    const rolledOver = dryRun ? [] : await rollOverTasks();
    const now = Date.now();
    const due = (await tasksWithReminders())
      .map(task => ({ task, next: nextReminder(task) }))
      .filter(({ next }) => next && next.fireAt.getTime() - now <= HORIZON_MS);
    if (!dryRun) for (const { task } of due) await scheduleReminder(task);
    return NextResponse.json({
      ok: true, dryRun, rolledOver: rolledOver.length,
      scheduled: due.map(({ task, next }) => ({ title: task.title, date: next!.date, fireAt: next!.fireAt.toISOString() })),
    });
  } catch (error: any) {
    console.error('todo-reminders failed', error?.message);
    return NextResponse.json({ ok: false, error: 'reminder_run_failed' }, { status: 500 });
  }
}
