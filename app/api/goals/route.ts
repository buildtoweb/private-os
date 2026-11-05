import { NextRequest, NextResponse } from 'next/server';
import { GOALS_ENABLED, createGoal, deleteGoal, listGoals, listPinnedGoals, optionalGoalsError, updateGoal } from '@/lib/goals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!GOALS_ENABLED) return NextResponse.json({ enabled: false, goals: [], pinned: [] });
    const month = req.nextUrl.searchParams.get('month') || undefined;
    const pinned = req.nextUrl.searchParams.get('pinned') === '1';
    if (pinned) return NextResponse.json({ enabled: true, goals: await listPinnedGoals() });
    return NextResponse.json({ enabled: true, goals: await listGoals(month) });
  } catch (e: any) {
    return NextResponse.json(optionalGoalsError(e));
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!GOALS_ENABLED) return NextResponse.json({ ok: false, error: 'GOALS_DB_NOT_CONFIGURED' }, { status: 400 });
    const body = await req.json();
    const page: any = await createGoal(body);
    return NextResponse.json({ ok: true, id: page.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.body?.message || e?.message || String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!GOALS_ENABLED) return NextResponse.json({ ok: false, error: 'GOALS_DB_NOT_CONFIGURED' }, { status: 400 });
    const { id, ...patch } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
    await updateGoal(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.body?.message || e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!GOALS_ENABLED) return NextResponse.json({ ok: false, error: 'GOALS_DB_NOT_CONFIGURED' }, { status: 400 });
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    await deleteGoal(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.body?.message || e?.message || String(e) }, { status: 500 });
  }
}
