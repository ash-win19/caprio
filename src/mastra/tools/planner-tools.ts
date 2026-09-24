import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Each tool changes the day's draft plan through the Caprio backend. The
// backend validates the change, merges it into the draft, and returns the full
// resulting plan. Validation problems come back as { ok: false, error } so the
// model can correct itself; only transport failures throw.

const ref = z.string().describe('A task id from ownedTasks, or a ref from the plan (new tasks use "new:…").');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('ISO date YYYY-MM-DD.');

const taskFields = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(12000).nullable().optional(),
  duration: z.number().int().min(1).max(1440).nullable().optional().describe('Minutes. Only when the person gave an estimate.'),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
});

async function callBackend(name: string, input: unknown, requestContext: { get(key: string): unknown } | undefined, signal?: AbortSignal) {
  const base = process.env.CAPRIO_BACKEND_URL;
  const secret = process.env.PLANNER_TOOL_SECRET;
  const token = requestContext?.get('turnToken');
  if (!base || !secret) throw new Error('Planner tools are not configured (CAPRIO_BACKEND_URL, PLANNER_TOOL_SECRET).');
  if (typeof token !== 'string' || !token) throw new Error('This turn has no planner token.');
  const response = await fetch(`${base.replace(/\/$/, '')}/internal/planner/tools/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Caprio-Internal': secret, 'X-Caprio-Turn': token },
    body: JSON.stringify(input ?? {}),
    signal,
  });
  if (!response.ok) throw new Error(`Planner tool ${name} failed with status ${response.status}.`);
  return response.json();
}

const plannerTool = <T extends z.ZodTypeAny>(id: string, description: string, inputSchema: T) =>
  createTool({
    id,
    description,
    inputSchema,
    execute: async (input, context) => callBackend(id, input, context?.requestContext, context?.abortSignal),
  });

export const plannerTools = {
  add_task: plannerTool(
    'add_task',
    'Add a task to the draft plan. Returns status "exists" instead of adding when the task is already saved or already in the draft.',
    taskFields.extend({
      title: z.string().min(1).max(500),
      date: isoDate.optional().describe('Work date. Omit for the conversation day.'),
      inbox: z.boolean().optional().describe('Only when the person wants it kept unplanned.'),
      newOccurrence: z.boolean().optional().describe('Only when the person explicitly asks to do completed work again.'),
    }),
  ),
  edit_task: plannerTool(
    'edit_task',
    'Change fields of a task in the plan. Include only the fields the person asked to change; null clears a field.',
    z.object({ ref, fields: taskFields }),
  ),
  move_task: plannerTool(
    'move_task',
    'Move a task to another day, or to the inbox.',
    z.object({ ref, date: isoDate.optional(), inbox: z.boolean().optional() }),
  ),
  remove_task: plannerTool('remove_task', 'Remove a task from the plan.', z.object({ ref })),
  set_completed: plannerTool(
    'set_completed',
    'Mark a saved task done (completed: true) or not done (false), only when the person says so.',
    z.object({ ref, completed: z.boolean() }),
  ),
  revert_change: plannerTool('revert_change', 'Undo the latest change to a task in the plan, e.g. when the person says "undo that" or "keep it after all".', z.object({ ref })),
  read_plan: plannerTool('read_plan', 'Return the current plan without changing it.', z.object({})),
};
