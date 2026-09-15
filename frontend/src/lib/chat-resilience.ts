import { FALLBACK_CHAT_MODEL } from '@/lib/chat-models';

function errorStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    return Number((error as { status: unknown }).status);
  }
  return NaN;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

/** True when a chat failure looks like model/provider overload, timeout, or 503. */
export function isModelCapacityError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error &&
      ['plan_incomplete', 'over_capacity', 'validation', 'auth', 'conflict'].includes(String(error.code))) return false;
  const message = errorMessage(error);
  if (/not configured/i.test(message)) return false;

  const status = errorStatus(error);
  if (status === 503 || status === 502 || status === 504 || status === 429) {
    return true;
  }
  return /overload|timed?\s*out|timeout|capacity|rate.?limit|unavailable|too many requests/i.test(message);
}

export function shouldFallbackToGroq(error: unknown, currentModel?: string): boolean {
  if (!isModelCapacityError(error)) return false;
  return (currentModel || '') !== FALLBACK_CHAT_MODEL;
}
