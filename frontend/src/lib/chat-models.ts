import type { PromptModel } from '@/components/agents/prompt-input';

export const DEFAULT_CHAT_MODEL = 'groq/openai/gpt-oss-120b';

export const CHAT_MODELS: PromptModel[] = [
  {
    value: 'groq/openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
  },
  {
    value: 'google/gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
  },
  {
    value: 'groq/openai/gpt-oss-20b',
    label: 'GPT-OSS 20B',
  },
];

/** Automatic fallback when the selected model is overloaded or times out. */
export const FALLBACK_CHAT_MODEL = 'groq/openai/gpt-oss-20b';
