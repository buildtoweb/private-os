import { agentWriteRoute } from '@/lib/agent/handler';
import { AgentError } from '@/lib/agent/envelope';
import { optionalNumber, optionalString, rejectUnknown, writeDate } from '@/lib/agent/write/body';
import { setDayFields } from '@/lib/agent/write/habits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = ['date', 'mood', 'note', 'grateful_for', 'intention', 'done_well', 'better_tomorrow'];

// Body: mood (1–10), note and the four daily-journal fields. Writing any journal
// field auto-checks the "journaling" habit, exactly as the Today page does.
export const POST = agentWriteRoute(async ({ body }) => {
  rejectUnknown(body, FIELDS);
  const input = {
    date: writeDate(body),
    mood: optionalNumber(body, 'mood', { min: 1, max: 10, integer: true }),
    note: optionalString(body, 'note', { max: 2000 }),
    grateful_for: optionalString(body, 'grateful_for', { max: 2000 }),
    intention: optionalString(body, 'intention', { max: 2000 }),
    done_well: optionalString(body, 'done_well', { max: 2000 }),
    better_tomorrow: optionalString(body, 'better_tomorrow', { max: 2000 }),
  };
  if (FIELDS.slice(1).every((f) => (input as any)[f] === undefined)) {
    throw new AgentError('nothing_to_update', `Mindestens eines dieser Felder wird benötigt: ${FIELDS.slice(1).join(', ')}.`, 400);
  }
  return setDayFields(input);
});
