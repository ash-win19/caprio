import { Agent } from '@mastra/core/agent';
import { dailyPlannerInstructions } from './generated/daily-planner-instructions';
import { plannerTools } from '../tools/planner-tools';

export const generalConversationAgent = new Agent({
  id: 'general-conversation-agent',
  name: 'Caprio Daily Planner',
  description: 'Talks through the day and edits its draft plan with planner tools for the person to confirm.',
  instructions: dailyPlannerInstructions,
  model: 'groq/openai/gpt-oss-120b',
  tools: plannerTools,
});
