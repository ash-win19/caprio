import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

import { generalConversationAgent } from './agents/general-conversation-agent';

const storage = new LibSQLStore({
  id: 'mastra-storage',
  url: process.env.TURSO_DATABASE_URL ?? 'file:../mastra.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const mastra = new Mastra({
  agents: {
    generalConversationAgent,
  },
  storage,
  memory: {
    'default': new Memory({
      storage,
      options: {
        generateTitle: true,
      },
    }),
  },
});
