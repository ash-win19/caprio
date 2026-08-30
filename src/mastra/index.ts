import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';

import { generalConversationAgent } from './agents/general-conversation-agent';
import { taskCaptureAgent } from './agents/task-capture-agent';

export const mastra = new Mastra({
  agents: {
    generalConversationAgent,
    taskCaptureAgent,
  },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: process.env.TURSO_DATABASE_URL ?? 'file:../mastra.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  }),
});
