import type { PromptModel } from '@/components/agents/prompt-input';

export const DEFAULT_CHAT_MODEL = 'google/gemini-3.7-flash';

export const CHAT_MODELS: PromptModel[] = [
  {
    value: 'google/gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
  },
  {
    value: 'groq/openai/gpt-oss-20b',
    label: 'GPT-OSS 20B',
  },
  {
    value: 'groq/openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
  },
];
