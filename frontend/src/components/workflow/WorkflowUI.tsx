import { Button } from '@/components/ui/button';

const KNOWN_ERRORS: Record<string, string> = {
  'the next day is already wrapped up': 'The next day is already wrapped up, so tasks can’t carry there. Drop them, or leave this Day as it is.',
  'Internal server error': 'Something went wrong on our end. Please try again.',
  'the planning assistant is not configured': 'Planning isn’t available right now. Please try again in a moment.',
  'the planning model is overloaded or timed out; try again or switch models': 'The planning model is busy or timed out. Try again, or switch to Groq in the model picker.',
};

export type WorkflowErrorCategory = 'capacity' | 'validation' | 'auth' | 'model' | 'generic';

function workflowErrorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

/** Classify API/workflow failures into human-facing buckets. */
export function workflowErrorCategory(error: unknown): WorkflowErrorCategory {
  const code = workflowErrorCode(error);
  if (code === 'auth') return 'auth';
  if (code === 'over_capacity' || code === 'plan_incomplete' || code === 'validation') return 'validation';
  if (code === 'model_unavailable') return 'model';
  const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : NaN;
  const message = error instanceof Error ? error.message : '';
  if (status === 401 || status === 403 || /session expired|unauthorized|forbidden/i.test(message)) return 'auth';
  if (
    status === 503 || status === 429 || status === 502 || status === 504
    || /overload|timed?\s*out|timeout|capacity|rate.?limit|unavailable|too many requests|model is overloaded/i.test(message)
  ) {
    return 'capacity';
  }
  if (
    status === 400
    || /failed validation|proposal omitted|exceed the available time|invalid proposal|unknown, completed, or repeated task|invalid date|must contain/i.test(message)
  ) {
    return 'validation';
  }
  if (/mastra|planning model|model.*(down|unavailable)|provider/i.test(message)) return 'model';
  return 'generic';
}

export function workflowErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.';
  const code = workflowErrorCode(error);
  if (code === 'plan_update_failed') return 'I couldn’t update the plan. Try again.';
  if (code === 'turn_in_progress') return 'Still replying to your last message.';
  if (code === 'over_capacity' || code === 'validation' || code === 'conflict') return KNOWN_ERRORS[error.message] || error.message;
  if (KNOWN_ERRORS[error.message]) return KNOWN_ERRORS[error.message];

  const category = workflowErrorCategory(error);
  if (category === 'auth') {
    return 'Your session expired. Sign in again to continue.';
  }
  if (category === 'capacity') {
    if (/planning model is overloaded/i.test(error.message)) return KNOWN_ERRORS['the planning model is overloaded or timed out; try again or switch models'];
    if (/planning assistant is not configured/i.test(error.message)) return KNOWN_ERRORS['the planning assistant is not configured'];
    return 'The planning model is busy or timed out. Try again, or switch models.';
  }
  if (category === 'validation' || /failed validation/i.test(error.message)) {
    if (/failed validation/i.test(error.message)) {
      return 'The proposed plan wasn’t complete enough to save. Tell Caprio what to include or drop, then try again.';
    }
    if (/proposal omitted|exceed the available time|invalid proposal|unknown, completed, or repeated task/i.test(error.message)) {
      return 'That plan couldn’t be validated. Adjust the tasks or available time, then ask for another proposal.';
    }
  }
  if (category === 'model') {
    return 'The planning model couldn’t answer. Try again or switch models.';
  }
  if (KNOWN_ERRORS[error.message]) return KNOWN_ERRORS[error.message];
  return error.message;
}

export function WorkflowError({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
    <p className="text-destructive">{workflowErrorMessage(error)}</p>
    {retry && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>Try again</Button>}
  </div>;
}
