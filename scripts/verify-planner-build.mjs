import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Inspect the built agent without opening a remote store or calling a model.
process.env.TURSO_DATABASE_URL = 'file::memory:';
delete process.env.TURSO_AUTH_TOKEN;

const { m: mastra } = await import('../.mastra/output/mastra.mjs');
const agent = mastra.getAgent('generalConversationAgent');
const expected = (await readFile(new URL('../src/mastra/agents/daily-planner.md', import.meta.url), 'utf8')).trim();

assert.equal(await agent.getInstructions(), expected, 'The built planner must use the current Markdown instructions.');
assert.equal(agent.id, 'general-conversation-agent', 'The backend generate endpoint must keep its agent ID.');
assert.deepEqual(Object.keys(mastra.listAgents()), ['generalConversationAgent']);
assert.equal(await agent.getMemory(), undefined, 'Conversation history comes from the backend.');
assert.deepEqual(
  Object.keys(await agent.listTools()).sort(),
  ['add_task', 'edit_task', 'move_task', 'read_plan', 'remove_task', 'revert_change', 'set_available_time', 'set_completed'],
  'The planner changes the draft only through its planner tools.',
);

// Tasks have no category or urgency. The tool schemas must pass such fields on
// to the backend, which rejects them, instead of silently dropping them.
const tools = await agent.listTools();
assert.equal(tools.add_task.inputSchema.parse({ title: 'Slides', urgency: 'high' }).urgency, 'high', 'add_task must not drop unknown task fields.');
assert.equal(tools.edit_task.inputSchema.parse({ ref: 'r', fields: { categoryId: 'c' } }).fields.categoryId, 'c', 'edit_task must not drop unknown task fields.');

console.log('Built planner matches canonical Markdown, preserves its endpoint ID, uses backend history, and has its planner tools.');
