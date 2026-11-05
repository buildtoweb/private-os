import { agentWriteRoute } from '@/lib/agent/handler';
import { optionalBoolean, optionalNumber, rejectUnknown, requireString, writeDate } from '@/lib/agent/write/body';
import { setWeeklyHabit } from '@/lib/agent/write/habits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Body: { habit: "gym", value: 3, date? }  — counters (gym, sauna)
//       { habit: "reflexion" | "lesen", done: true, date? } — checkbox
export const POST = agentWriteRoute(async ({ body }) => {
  rejectUnknown(body, ['habit', 'value', 'done', 'date']);
  return setWeeklyHabit({
    date: writeDate(body),
    habitKey: requireString(body, 'habit'),
    value: optionalNumber(body, 'value', { min: 0, max: 50, integer: true }),
    done: optionalBoolean(body, 'done'),
  });
});
