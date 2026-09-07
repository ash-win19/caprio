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

console.log('Built planner matches canonical Markdown, preserves its endpoint ID, and uses backend history.');
