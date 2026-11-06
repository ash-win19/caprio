import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { dailyPlannerInstructions } from './generated/daily-planner-instructions';

const storage = new LibSQLStore({
  id: 'agent-storage',
  url: process.env.TURSO_DATABASE_URL ?? 'file:../mastra.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const generalConversationAgent = new Agent({
  id: 'general-conversation-agent',
  name: 'Caprio Daily Planner',
  description: 'Proposes a realistic daily plan and adapts it for the user to confirm.',
  instructions: dailyPlannerInstructions,
  model: 'groq/openai/gpt-oss-120b',
  memory: new Memory({
    storage,
    options: {
      generateTitle: true,
    },
  }),
});
