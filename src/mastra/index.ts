import { Mastra } from '@mastra/core/mastra';

import { caprioConversationAgent } from './agents/caprio-conversation-agent';

export const mastra = new Mastra({
  agents: { caprioConversationAgent },
});
