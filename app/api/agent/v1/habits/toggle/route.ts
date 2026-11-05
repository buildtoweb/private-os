import { agentWriteRoute } from '@/lib/agent/handler';
import { readBody, rejectUnknown, requireBoolean, requireString, writeDate } from '@/lib/agent/write/body';
import { setDailyHabit } from '@/lib/agent/write/habits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Body: { habit: "meditation", done: true, date?: "YYYY-MM-DD" }
// `done` is explicit rather than a toggle, so a retry is idempotent.
export const POST = agentWriteRoute(async ({ body }) => {
  rejectUnknown(body, ['habit', 'done', 'date']);
  return setDailyHabit({
    date: writeDate(body),
    habitKey: requireString(body, 'habit'),
    done: requireBoolean(body, 'done'),
  });
});
