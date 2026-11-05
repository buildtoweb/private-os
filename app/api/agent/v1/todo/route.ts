import { agentRoute, agentWriteRoute } from '@/lib/agent/handler';
import { AgentError } from '@/lib/agent/envelope';
import { createTask, deleteTask, listTasks, rollOverTasks, TodoError, updateTask } from '@/lib/todo/store';
import { doneOn, occursOn } from '@/lib/todo/schedule';
import { appToday } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function agentError(error: unknown): never {
  if (error instanceof TodoError) throw new AgentError(error.code, error.message, error.status);
  throw error;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PARAMS = new Set(['include_deleted', 'date', 'open', 'inbox']);

// Filters keep an agent's context small: `date=today` answers "what is on my
// plate today" (recurring tasks included) without shipping the whole list.
export const GET = agentRoute(async ({ params }) => {
  const unknown = [...params.keys()].filter(key => !PARAMS.has(key));
  if (unknown.length) throw new AgentError('invalid_param', `Unbekannte Parameter: ${unknown.join(', ')}. Erlaubt: ${[...PARAMS].join(', ')}.`);
  const includeDeleted = params.get('include_deleted') === '1';
  const rawDate = params.get('date');
  const date = rawDate === 'today' ? appToday() : rawDate === 'tomorrow' ? (() => { const d = new Date(`${appToday()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })() : rawDate;
  if (date && !DATE.test(date)) throw new AgentError('invalid_param', 'date muss YYYY-MM-DD, today oder tomorrow sein.');
  try {
    await rollOverTasks();
    let tasks = await listTasks(includeDeleted);
    if (date) tasks = tasks.filter(task => occursOn(task, date)).map(task => ({ ...task, doneOnDate: doneOn(task, date) }));
    if (params.get('inbox') === '1') tasks = tasks.filter(task => !task.date);
    if (params.get('open') === '1') tasks = tasks.filter(task => !task.deletedAt && !doneOn(task, date ?? undefined));
    const open = tasks.filter(task => !task.deletedAt && !doneOn(task, date ?? undefined)).length;
    return { tasks, count: tasks.length, ...(date ? { date } : {}), summary: `${open} offene Aufgaben${date ? ` am ${date}` : ''}.` };
  } catch (error) { agentError(error); }
});

export const POST = agentWriteRoute(async ({ body }) => {
  try { return { created: true, task: await createTask(body) }; }
  catch (error) { agentError(error); }
});

export const PATCH = agentWriteRoute(async ({ body }) => {
  const { id, ...patch } = body;
  try { return { changed: true, task: await updateTask(id as string, patch) }; }
  catch (error) { agentError(error); }
});

// Soft-delete: the row remains in Supabase and can be restored.
export const DELETE = agentWriteRoute(async ({ body }) => {
  if (Object.keys(body).some(key => key !== 'id')) throw new AgentError('unknown_field', 'Nur id ist erlaubt.');
  try { await deleteTask(body.id as string); return { deleted: true, id: body.id, recoverable: true }; }
  catch (error) { agentError(error); }
});
