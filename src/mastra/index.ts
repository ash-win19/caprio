import { timingSafeEqual } from 'node:crypto';

import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';

import { generalConversationAgent } from './agents/general-conversation-agent';

// Mastra keeps its own tables in the `mastra` schema of Caprio's Neon database,
// beside the Go backend's tables in `public`. Use Neon's pooled connection
// string: the agent server will run as serverless functions, so each instance
// keeps only a few connections. Tables are created on first start.
const connectionString = process.env.MASTRA_DATABASE_URL;
if (!connectionString) {
  throw new Error('MASTRA_DATABASE_URL is required: set it to the Postgres connection string for Mastra storage.');
}

// Only the Caprio backend may call the agent server: every route except the
// health check needs AGENT_SERVER_SECRET in the X-Caprio-Agent-Secret header.
// `mastra dev` sets MASTRA_DEV so Studio works locally without the header; any
// other run refuses to start without the secret.
export const AGENT_SECRET_HEADER = 'x-caprio-agent-secret';
const isDevServer = process.env.MASTRA_DEV === 'true';
const agentServerSecret = process.env.AGENT_SERVER_SECRET;
if (!agentServerSecret && !isDevServer) {
  throw new Error('AGENT_SERVER_SECRET is required: set it to the secret the backend sends as MASTRA_AGENT_SECRET.');
}

function hasAgentSecret(given: string | undefined) {
  if (!given || !agentServerSecret) return false;
  const expected = Buffer.from(agentServerSecret);
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const mastra = new Mastra({
  agents: {
    generalConversationAgent,
  },
  storage: new PostgresStore({
    id: 'mastra-storage',
    connectionString,
    schemaName: 'mastra',
    max: 5,
  }),
  server: {
    middleware: [
      async (c, next) => {
        if (isDevServer || c.req.path === '/health' || hasAgentSecret(c.req.header(AGENT_SECRET_HEADER))) return next();
        return c.json({ error: 'unauthorized' }, 401);
      },
    ],
  },
});
