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
});
