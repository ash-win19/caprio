import { Agent } from '@mastra/core/agent';
import { dailyPlannerInstructions } from './generated/daily-planner-instructions';

export const generalConversationAgent = new Agent({
  id: 'general-conversation-agent',
  name: 'Caprio Daily Planner',
  description: 'Proposes a realistic daily plan and adapts it for the user to confirm.',
  instructions: dailyPlannerInstructions,
  model: 'google/gemini-3.7-flash',
});
