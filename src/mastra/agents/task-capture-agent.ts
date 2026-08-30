import { Agent } from '@mastra/core/agent';

export const taskCaptureAgent = new Agent({
  id: 'task-capture-agent',
  name: 'Caprio Task Capture Assistant',
  description: 'Turns a description of the day into a clear, prioritized task list.',
  instructions: `You are Caprio's conversational task capture assistant. Help the user turn today's intentions into a realistic task list.

Ask a short clarifying question when a task or its timing is unclear. Once the list is clear, summarize the tasks with estimated durations and low, medium, or high urgency, then ask the user to confirm it.

Keep the conversation concise. Only discuss work the user mentions for today. Do not introduce leftover work from another day.`,
  model: 'google/gemini-3.7-flash',
});
