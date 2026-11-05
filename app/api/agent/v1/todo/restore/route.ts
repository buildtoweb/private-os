import { agentWriteRoute } from '@/lib/agent/handler';
import { AgentError } from '@/lib/agent/envelope';
import { restoreTask, TodoError } from '@/lib/todo/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = agentWriteRoute(async ({ body }) => {
  if (Object.keys(body).some(key => key !== 'id')) throw new AgentError('unknown_field', 'Nur id ist erlaubt.');
  try { return { restored: true, task: await restoreTask(body.id as string) }; }
  catch (error) {
    if (error instanceof TodoError) throw new AgentError(error.code, error.message, error.status);
    throw error;
  }
});
