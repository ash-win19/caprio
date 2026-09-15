import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { FALLBACK_CHAT_MODEL } from '@/lib/chat-models';
import { isModelCapacityError, shouldFallbackToGroq } from '@/lib/chat-resilience';

describe('chat resilience', () => {
  it('never retries validation, capacity, authentication, or conflict errors on another provider', () => {
    for (const code of ['plan_incomplete', 'over_capacity', 'validation', 'auth', 'conflict']) {
      expect(shouldFallbackToGroq(new ApiError(400, 'capacity unavailable', code), 'google/gemini-3.7-flash')).toBe(false);
    }
  });
  it('detects capacity-like API failures', () => {
    expect(isModelCapacityError(new ApiError(503, 'the planning model is overloaded or timed out; try again or switch models'))).toBe(true);
    expect(isModelCapacityError(new ApiError(502, 'bad gateway'))).toBe(true);
    expect(isModelCapacityError(new ApiError(500, 'model overload please retry'))).toBe(true);
    expect(isModelCapacityError(new ApiError(500, 'Internal server error'))).toBe(false);
    expect(isModelCapacityError(new ApiError(503, 'the planning assistant is not configured'))).toBe(false);
    expect(isModelCapacityError(Object.assign(new Error('overloaded'), { status: 503 }))).toBe(true);
  });

  it('only falls back when the user is not already on Groq 20B', () => {
    const err = new ApiError(503, 'the planning model is overloaded or timed out; try again or switch models');
    expect(shouldFallbackToGroq(err, 'google/gemini-3.7-flash')).toBe(true);
    expect(shouldFallbackToGroq(err, FALLBACK_CHAT_MODEL)).toBe(false);
    expect(shouldFallbackToGroq(new ApiError(400, 'bad request'), 'google/gemini-3.7-flash')).toBe(false);
  });
});
