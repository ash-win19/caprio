import { Mastra } from '@mastra/core/mastra';
import { chatRoute } from '@mastra/ai-sdk';
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
    url: 'file:../mastra.db',
  }),
  server: {
    apiRoutes: [
      chatRoute({
        path: '/chat',
        agent: 'general-conversation-agent',
        version: 'v7',
      }),
    ],
  },
});
