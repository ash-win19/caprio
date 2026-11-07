import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { workflowErrorCategory, workflowErrorMessage } from './WorkflowUI';

describe('workflowErrorMessage', () => {
  it('uses structured validation codes without mistaking day capacity for provider overload', () => {
    const capacity = new ApiError(400, '60 minutes planned, 30 minutes available', 'over_capacity');
    expect(workflowErrorCategory(capacity)).toBe('validation');
    expect(workflowErrorMessage(capacity)).toBe('60 minutes planned, 30 minutes available');
    expect(workflowErrorMessage(new ApiError(400, 'failed', 'plan_update_failed'))).toBe('I couldn’t update the plan. Try again.');
    expect(workflowErrorMessage(new ApiError(409, 'still replying to your last message', 'turn_in_progress'))).toBe('Still replying to your last message.');
  });
  it('maps capacity, validation, auth, and generic failures', () => {
    expect(workflowErrorCategory(new ApiError(503, 'the planning model is overloaded or timed out; try again or switch models'))).toBe('capacity');
    expect(workflowErrorMessage(new ApiError(503, 'the planning model is overloaded or timed out; try again or switch models'))).toMatch(/busy or timed out/i);

    expect(workflowErrorCategory(new ApiError(400, 'proposal omitted an unfinished task'))).toBe('validation');
    expect(workflowErrorMessage(new ApiError(400, 'proposal omitted an unfinished task'))).toMatch(/couldn’t be validated/i);

    expect(workflowErrorCategory(new ApiError(401, 'Your session expired. Sign in again to continue.'))).toBe('auth');
    expect(workflowErrorMessage(new ApiError(401, 'Your session expired. Sign in again to continue.'))).toMatch(/session expired/i);

    expect(workflowErrorMessage(new ApiError(500, 'Internal server error'))).toMatch(/our end/i);
  });
});
