import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';
import { createTask, deleteTask, listTasks, rollOverTasks, TodoError, updateTask } from '@/lib/todo/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'cache-control': 'no-store, private' };
function denied(req: NextRequest) { return !verify(req.cookies.get(COOKIE)?.value); }
function unauthorized() { return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers }); }
function failure(error: unknown) {
  if (error instanceof TodoError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers });
  return NextResponse.json({ ok: false, code: 'internal_error', error: 'Aufgaben konnten nicht verarbeitet werden.' }, { status: 500, headers });
}
async function body(req: NextRequest): Promise<unknown> {
  try { return await req.json(); } catch { throw new TodoError('invalid_body', 'Gültiges JSON ist erforderlich.'); }
}

export async function GET(req: NextRequest) {
  if (denied(req)) return unauthorized();
  try { await rollOverTasks(); return NextResponse.json({ ok: true, tasks: await listTasks() }, { headers }); }
  catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  if (denied(req)) return unauthorized();
  try { return NextResponse.json({ ok: true, task: await createTask(await body(req)) }, { status: 201, headers }); }
  catch (error) { return failure(error); }
}

export async function PATCH(req: NextRequest) {
  if (denied(req)) return unauthorized();
  try {
    const raw = await body(req);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TodoError('invalid_body', 'Ein JSON-Objekt ist erforderlich.');
    const { id, ...patch } = raw as Record<string, unknown>;
    return NextResponse.json({ ok: true, task: await updateTask(id as string, patch) }, { headers });
  } catch (error) { return failure(error); }
}

export async function DELETE(req: NextRequest) {
  if (denied(req)) return unauthorized();
  try {
    const raw = await body(req);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'id')) throw new TodoError('invalid_body', 'Nur id ist erlaubt.');
    await deleteTask((raw as Record<string, unknown>).id as string);
    return NextResponse.json({ ok: true, deleted: true }, { headers });
  } catch (error) { return failure(error); }
}
