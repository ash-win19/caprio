import { clearDateDrafts } from '@/lib/dateDrafts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import * as api from '@/lib/api';
import { localDate, nextDate, previousDate } from '@/lib/date';
import New from './New';
import Review from './Review';
import Capture from './Capture';
import Today from './Today';
import { DaySummary } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';
import { VoiceWidget } from '@/components/VoiceWidget';

vi.mock('@/lib/api');
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const today = localDate();
const task = (id: string, completed = false, deferCount = 0): api.BackendTask => ({
  id, userId: 'user', title: id === 'report' ? 'Finish report' : 'Team meeting', urgency: 'medium', duration: 30,
  source: 'manual', completed, sortOrder: 0, plannedForDate: today,
  status: completed ? 'completed' : 'planned', deferCount, createdAt: today, updatedAt: today,
});
const baseWorkflow = (): api.Workflow => ({ date: today, state: 'planning', version: 2, messages: [], plan: null, availableMinutes: null, tasks: [], backlog: [], review: null });
const plan = (over: Partial<api.PlanView> = {}): api.PlanView => ({ draftId: 'draft-1', today: [{ ref: 'new:1', title: 'Finish report', badge: 'new', date: today, duration: 30 }], carried: [], otherDays: [], doneCount: 0, counts: { new: 1, edited: 0, moved: 0, removed: 0, carried: 0 }, ...over });
let workflow: api.Workflow;

function mount(element: ReactElement, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path={path.split('?')[0]} element={element} />
    {path.split('?')[0] !== '/today' && <Route path="/today" element={<p>Saved plan destination</p>} />}
  </Routes></MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  clearDateDrafts();
  vi.clearAllMocks();
  workflow = baseWorkflow();
  vi.mocked(api.getWorkflow).mockImplementation(async () => workflow);
  vi.mocked(api.getChatSessions).mockResolvedValue([]);
  vi.mocked(api.bootstrap).mockResolvedValue({ user: { id: 'user', name: 'Ashwin', email: 'user@example.com' }, onboardingComplete: true, preferences: { briefTime: '08:00', nudgeFrequency: 'light', proactiveReprioritization: false, eodReminder: false, eodTime: '18:00', micSensitivity: 50, language: 'en', saveTranscripts: false }, categories: [], todayTasks: [], backlog: [], streak: 0 });
  vi.mocked(api.getTodayTasks).mockResolvedValue([]);
  vi.mocked(api.getInboxTasks).mockResolvedValue([]);
});

describe('Missed-day recovery and archived outcomes', () => {
  it('explains missing legacy task details without inventing historical names', () => {
    workflow = { ...workflow, state: 'closed', taskDetailsAvailable: false, tasks: [], review: { completedCount: 2, carriedToTomorrowCount: 0, droppedCount: 1, notes: '', energyLevel: null } };
    mount(<DaySummary workflow={workflow} />, '/review');
    expect(screen.getByText(/Task details were not recorded/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('continues an older carry through the next date’s Review', () => {
    const date = previousDate(previousDate(previousDate(today)));
    workflow = { ...workflow, date, state: 'closed', tasks: [], review: { completedCount: 0, carriedToTomorrowCount: 1, droppedCount: 0, notes: '', energyLevel: null } };
    mount(<DaySummary workflow={workflow} />, `/review?date=${date}`);
    expect(screen.getByRole('link', { name: `Review ${dateLabel(nextDate(date))}` })).toHaveAttribute('href', `/review?date=${nextDate(date)}&reopen=1`);
  });

  it('allows review of an older task-only day and identifies its carry destination', async () => {
    const missed = previousDate(previousDate(previousDate(today)));
    workflow = { ...workflow, date: missed, state: 'planning', tasks: [{ ...task('report'), plannedForDate: missed }] };
    mount(<Review />, `/review?date=${missed}&reopen=1`);
    expect(await screen.findByRole('button', { name: /Drop: Finish report/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Carry to ${dateLabel(nextDate(missed))}: Finish report` })).toBeEnabled();
    expect(api.closeDay).not.toHaveBeenCalled();
  });

  it('shows exact archived task names grouped by their closing outcome', () => {
    const date = previousDate(today);
    workflow = { ...workflow, date, state: 'closed', tasks: [
      { ...task('report', true, 2), title: 'Finished report' },
      { ...task('meeting', false, 1), title: 'Carried presentation', plannedForDate: today },
      { ...task('drop', false, 2), title: 'Dropped research', status: 'dropped' },
    ], review: { completedCount: 1, carriedToTomorrowCount: 1, droppedCount: 1, notes: '', energyLevel: null } };
    mount(<DaySummary workflow={workflow} />, '/review');
    expect(screen.getByRole('region', { name: 'Done' })).toHaveTextContent('Finished report');
    expect(screen.getByRole('region', { name: `Carried to ${dateLabel(today)}` })).toHaveTextContent('Carried presentation');
    expect(screen.getByRole('region', { name: 'Dropped' })).toHaveTextContent('Dropped research');
  });
});

describe('Daily planning workflow', () => {
  it('keeps the whole conversation visible while a draft waits for confirmation', async () => {
    workflow = {
      ...workflow,
      messages: [
        { id: 'opener', role: 'event', eventType: 'opener', content: 'Morning. What’s on today?' },
        { id: 'u1', role: 'user', content: 'my tasks are: ship slides' },
        { id: 'a1', role: 'assistant', content: 'Got it, slides are on for today.' },
        { id: 'u2', role: 'user', content: 'add sleep early too' },
        { id: 'a2', role: 'assistant', content: 'Added sleep early.' },
      ],
      plan: plan({ today: [{ ref: 'new:2', title: 'Sleep early', badge: 'new', date: today }] }),
    };
    mount(<New />, '/new');
    const reply = await screen.findByText('Added sleep early.');
    expect(reply.closest('details')).toBeNull();
    for (const text of ['Morning. What’s on today?', 'my tasks are: ship slides', 'Got it, slides are on for today.', 'add sleep early too']) expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByText(/Conversation ·/)).not.toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Proposed plan' });
    expect(card).not.toHaveTextContent('Draft:');
    expect(card).toHaveTextContent('Today’s plan');
    expect(card).toHaveTextContent('Sleep early');
    expect(screen.getByRole('button', { name: 'Confirm plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revise/ })).not.toBeInTheDocument();
  });

  it('opens a new day with the app-written opener and no model call', async () => {
    workflow = { ...workflow, opener: 'Morning. 2 tasks carried over from yesterday. What’s on today?' };
    mount(<New />, '/new');
    expect(await screen.findByText('Morning. 2 tasks carried over from yesterday. What’s on today?')).toBeInTheDocument();
    expect(api.streamChatMessage).not.toHaveBeenCalled();
  });

  it('marks discarded and saved plans in the thread', async () => {
    workflow = { ...workflow, messages: [
      { id: 'u1', role: 'user', content: 'Add the report' },
      { id: 'a1', role: 'assistant', content: 'The report is on for today.' },
      { id: 'e1', role: 'event', eventType: 'discarded', content: 'Proposal discarded' },
      { id: 'e2', role: 'event', eventType: 'plan_saved', content: 'Plan saved · 1 task' },
    ] };
    mount(<New />, '/new');
    expect(await screen.findByRole('status', { name: 'Proposal discarded' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Plan saved · 1 task' })).toBeInTheDocument();
  });

  it('keeps a chat proposal as a draft without creating tasks or leaving Plan', async () => {
    vi.mocked(api.streamChatMessage).mockImplementationOnce(async request => {
      workflow = {
        ...workflow,
        version: 3,
        messages: [{ id: 'user', role: 'user', content: request.content }, { id: 'assistant', role: 'assistant', content: 'Review this draft.' }],
        plan: plan(),
      };
      return { text: 'Review this draft.', workflow };
    });
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Add Finish report' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    expect(await screen.findByRole('region', { name: 'Proposed plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm plan' })).toBeInTheDocument();
    expect(screen.queryByText('Saved plan destination')).not.toBeInTheDocument();
    expect(api.confirmDayPlan).not.toHaveBeenCalled();
    expect(workflow.tasks).toEqual([]);
  });

  it('creates tasks and opens Today only after Confirm plan', async () => {
    workflow = {
      ...workflow,
      messages: [{ id: 'message-1', role: 'user', content: 'Add Finish report' }],
      plan: plan(),
    };
    vi.mocked(api.confirmDayPlan).mockImplementation(async () => {
      workflow = { ...workflow, plan: null, state: 'active', tasks: [task('report')], version: 4 };
      return workflow;
    });
    mount(<New />, '/new');
    expect(await screen.findByRole('region', { name: 'Proposed plan' })).toBeInTheDocument();
    expect(api.confirmDayPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan' }));
    expect(await screen.findByText('Saved plan destination')).toBeInTheDocument();
    expect(api.confirmDayPlan).toHaveBeenCalledWith({ date: today, draftId: 'draft-1', version: 2 });
  });

  it('restores messages and requires a separate confirmation to save a proposal', async () => {
    workflow = { ...workflow, messages: [{ id: 'message-1', role: 'user', content: 'I have an hour for the report.' }], plan: plan() };
    vi.mocked(api.confirmDayPlan).mockImplementation(async () => ({ ...workflow, plan: null, state: 'active' }));
    mount(<New />, '/new');
    expect(await screen.findByText('I have an hour for the report.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Proposed plan' })).toHaveTextContent('Finish report');
    expect(screen.getByRole('region', { name: 'Proposed plan' })).toHaveTextContent('30 min');
    expect(api.confirmDayPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan' }));
    expect(await screen.findByText('Saved plan destination')).toBeInTheDocument();
    expect(api.confirmDayPlan).toHaveBeenCalledWith({ date: today, draftId: 'draft-1', version: 2 });
  });

  it('keeps a failed message in the thread and reuses its request ID when retried', async () => {
    vi.mocked(api.streamChatMessage)
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockImplementationOnce(async ({ onDelta }) => {
        onDelta?.('How much time');
        onDelta?.(' do you have?');
        workflow = { ...workflow, messages: [{ id: 'sent', role: 'user', content: 'Finish my report' }, { id: 'reply', role: 'assistant', content: 'How much time do you have?' }] };
        return { text: 'How much time do you have?', workflow };
      });
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Finish my report' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    expect(screen.getByText('Finish my report')).toBeInTheDocument();
    expect(input).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.streamChatMessage).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(api.streamChatMessage).mock.calls.map(([call]) => call);
    expect(second.requestId).toBe(first.requestId);
    expect(second.content).toBe('Finish my report');
    expect(second.date).toBe(today);
    await waitFor(() => expect(screen.getByText('How much time do you have?')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getAllByText('Finish my report')).toHaveLength(1);
  });

  it('shows a thinking state, streams the reply, then shows the saved message', async () => {
    let deliver!: (text: string) => void;
    let finish!: (reply: api.ChatReply) => void;
    vi.mocked(api.streamChatMessage).mockImplementationOnce(({ onDelta }) => new Promise((resolve) => {
      deliver = (text) => onDelta?.(text);
      finish = resolve;
    }));
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Plan my day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Thinking…');
    expect(screen.getByText('Plan my day')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeInTheDocument();
    act(() => deliver('Start with'));
    await waitFor(() => expect(screen.getByText('Start with')).toBeInTheDocument());
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
    act(() => deliver(' the report.'));
    await waitFor(() => expect(screen.getByText('Start with the report.')).toBeInTheDocument());
    workflow = { ...workflow, messages: [{ id: 'sent', role: 'user', content: 'Plan my day' }, { id: 'reply', role: 'assistant', content: 'Start with the report.' }] };
    await act(async () => finish({ text: 'Start with the report.', workflow }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop generating' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Start with the report.')).toBeInTheDocument());
    expect(screen.getAllByText('Plan my day')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Send prompt' })).toBeInTheDocument();
  });

  it('stops a reply on request and keeps the message ready to retry', async () => {
    vi.mocked(api.streamChatMessage).mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Plan my day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop generating' }));
    expect(await screen.findByText('Reply stopped. Nothing was saved.')).toBeInTheDocument();
    expect(screen.getByText('Plan my day')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send prompt' })).toBeInTheDocument();
  });

  it('requires stopping a reply before switching dates or pages', async () => {
    vi.mocked(api.streamChatMessage).mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Keep this request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled());
    fireEvent.click(screen.getByRole('link', { name: 'View tasks' }));
    expect(screen.queryByText('Saved plan destination')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled());
    fireEvent.click(screen.getByRole('link', { name: 'View tasks' }));
    expect(await screen.findByText('Saved plan destination')).toBeInTheDocument();
  });

  it('aborts on unmount and ignores late deltas and success without losing the stopped request', async () => {
    let deliver!: (text: string) => void;
    let finish!: (reply: api.ChatReply) => void;
    let signal!: AbortSignal;
    vi.mocked(api.streamChatMessage).mockImplementationOnce((request) => new Promise(resolve => {
      signal = request.signal!;
      deliver = text => request.onDelta?.(text);
      finish = resolve;
    }));
    const client = mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Keep the interrupted request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    await screen.findByRole('button', { name: 'Stop generating' });
    cleanup();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      deliver('Late response');
      finish({ text: 'Late response', workflow: { ...workflow, messages: [{ id: 'late', role: 'assistant', content: 'Late response' }] } });
    });
    expect(client.getQueryData<api.Workflow>(['workflow', today])?.messages).toEqual([]);
    mount(<New />, '/new');
    expect(await screen.findByText('Keep the interrupted request')).toBeInTheDocument();
    expect(screen.getByText('Reply stopped. Nothing was saved.')).toBeInTheDocument();
    expect(screen.queryByText('Late response')).not.toBeInTheDocument();
  });

  it('discards a proposal through the server without confirming tasks', async () => {
    workflow = { ...workflow, plan: plan() };
    vi.mocked(api.discardDayPlan).mockImplementation(async () => { workflow = { ...workflow, plan: null }; return workflow; });
    mount(<New />, '/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Proposed plan' })).not.toBeInTheDocument());
    expect(api.discardDayPlan).toHaveBeenCalledWith({ date: today, draftId: 'draft-1', version: 2 });
    expect(api.confirmDayPlan).not.toHaveBeenCalled();
  });

  it('keeps a historical conversation read-only', async () => {
    workflow = { ...workflow, date: '2020-01-01', plan: plan(), messages: [{ id: 'past', role: 'assistant', content: 'Your old plan.' }] };
    mount(<New />, '/new?date=2020-01-01');
    expect(await screen.findByText('Your old plan.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message about your day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm plan' })).not.toBeInTheDocument();
  });

  it('preselects completed tasks, persists closeout, and stays on the saved summary', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report', true), task('meeting')] };
    vi.mocked(api.closeDay).mockImplementation(async (input) => {
      const review = { completedCount: 1, carriedToTomorrowCount: 1, droppedCount: 0, notes: input.notes || null, energyLevel: input.energyLevel || null };
      workflow = { ...workflow, state: 'closed', review };
      return { ...review, nextDate: nextDate(today) };
    });
    mount(<Review />, '/review');
    expect(await screen.findByText('Already completed · 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done: Finish report' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow: Team meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByText(/Add a reflection/));
    fireEvent.change(screen.getByRole('textbox', { name: /Notes for tomorrow/ }), { target: { value: 'Leave room for the client call.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Steady' }));
    expect(api.closeDay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
    expect(await screen.findByRole('heading', { name: 'Day closed' })).toBeInTheDocument();
    expect(api.closeDay).toHaveBeenCalledWith({ date: today, taskActions: [{ taskId: 'report', action: 'done' }, { taskId: 'meeting', action: 'tomorrow' }], notes: 'Leave room for the client call.', energyLevel: 3 });
    expect(screen.getByRole('link', { name: 'Plan the next day' })).toHaveAttribute('href', `/new?date=${nextDate(today)}`);
  });

  it('does not allow closing a future day', async () => {
    workflow = { ...workflow, date: nextDate(today), state: 'active', tasks: [task('report')] };
    mount(<Review />, `/review?date=${nextDate(today)}`);
    expect(await screen.findByText('This day hasn’t started yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(api.closeDay).not.toHaveBeenCalled();
  });

  it('protects a pending review save from date controls and the global planning shortcut', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report')] };
    let finish!: (review: Awaited<ReturnType<typeof api.closeDay>>) => void;
    vi.mocked(api.closeDay).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount(<><Review /><VoiceWidget /></>, '/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Done: Finish report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Plan my day' })).toBeDisabled();
    fireEvent.keyDown(window, { code: 'Space', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('button', { name: 'Saving review…' })).toBeInTheDocument();
    workflow = { ...workflow, state: 'closed', review: { completedCount: 1, carriedToTomorrowCount: 0, droppedCount: 0, notes: null, energyLevel: null } };
    await act(async () => finish({ ...workflow.review!, nextDate: nextDate(today) }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Plan my day' })).toBeEnabled());
    expect(api.closeDay).toHaveBeenCalledTimes(1);
  });

  it('saves an inbox task without immediately adding it to today', async () => {
    vi.mocked(api.createTask).mockResolvedValue(task('report'));
    mount(<Capture />, '/capture');
    fireEvent.change(await screen.findByRole('textbox', { name: 'What do you need to do?' }), { target: { value: 'Finish report' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add task' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(api.createTask).toHaveBeenCalled());
    expect(vi.mocked(api.createTask).mock.calls[0][0]).toMatchObject({ title: 'Finish report', status: 'backlog', plannedForDate: today });
    expect(api.updateTask).not.toHaveBeenCalled();
  });

  it('keeps completion failure visible after restoring the task to its previous list', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report')] };
    vi.mocked(api.getTodayTasks).mockResolvedValue([{ id: 'report', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 0 }]);
    vi.mocked(api.updateTask).mockRejectedValue(new Error('Could not save completion'));
    mount(<Today />, '/today');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Mark Finish report complete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save completion');
    expect(screen.getByRole('checkbox', { name: 'Mark Finish report complete' })).not.toBeChecked();
  });

  it('shows an intentional empty plan as saved and nudges Something changed instead of Review', async () => {
    workflow = { ...workflow, state: 'active' };
    mount(<Today />, '/today');
    expect(await screen.findByRole('heading', { name: 'Nothing planned for this day' })).toBeInTheDocument();
    const interruptLinks = screen.getAllByRole('link', { name: /^Adjust plan$/i });
    expect(interruptLinks.length).toBeGreaterThan(0);
    expect(interruptLinks.every((link) => link.getAttribute('href') === `/new?date=${today}&intent=interrupt`)).toBe(true);
    expect(screen.queryByRole('link', { name: 'Review day →' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Review day/i })).not.toBeInTheDocument();
  });

  it('offers review without leading the active day with a closeout prompt', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report')] };
    vi.mocked(api.getTodayTasks).mockResolvedValue([{ id: 'report', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 0 }]);
    mount(<Today />, '/today');
    expect(await screen.findByRole('link', { name: /Review day/i })).toHaveAttribute('href', `/review?date=${today}`);
    expect(screen.getByRole('link', { name: 'Review day' })).toHaveAttribute('href', `/review?date=${today}`);
  });

  it('separates older work in a collapsible carryover list with its original date', async () => {
    workflow = { ...workflow, state: 'active', carryoverOrigins: { carry: previousDate(today) } };
    vi.mocked(api.getTodayTasks).mockResolvedValue([
      { id: 'carry', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: false, carriedOver: true, order: 0 },
      { id: 'fresh', title: 'Team meeting', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 1 },
    ]);
    mount(<Today />, '/today');
    expect(await screen.findByText('Carried forward')).toBeInTheDocument();
    expect(screen.getByText('1 from yesterday')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Remaining tasks' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Carried forward'));
    expect(screen.getByTitle(dateLabel(previousDate(today), true))).toHaveAttribute('datetime', previousDate(today));
    expect(screen.getByRole('checkbox', { name: 'Mark Finish report complete' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark Team meeting complete' })).toBeInTheDocument();
  });

  it('defaults unchecked work to carry forward on Review', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('meeting')] };
    mount(<Review />, '/review');
    expect(await screen.findByText(/Unchecked tasks are set to tomorrow/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tomorrow: Team meeting' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Drop removes a task from the plan/i)).toBeInTheDocument();
  });

  it('surfaces a human-readable error when tomorrow is already closed', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('meeting')] };
    vi.mocked(api.closeDay).mockRejectedValue(new Error('tomorrow is already closed'));
    mount(<Review />, '/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Tomorrow: Team meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/next calendar day is already closed/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/Choose Done or Drop/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/reopen tomorrow/i);
  });
  it.each([false, true])('shows the remaining count in the header and leaves carry context to the opener, with existing conversation: %s', async (hasMessages) => {
    workflow = { ...workflow, tasks: [task('report', false, 3), task('meeting'), task('done', true, 2)],
      messages: hasMessages ? [{ id: 'earlier', role: 'user', content: 'Help me plan around these tasks.' }] : [] };
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    const summary = await screen.findByRole('status', { name: 'Task summary' });
    expect(summary).toHaveTextContent('2 remaining');
    expect(summary).not.toHaveTextContent(/carried/i);
    expect(summary.closest('header')).not.toBeNull();
    expect(screen.queryByText(/already waiting|Estimates are optional|They stay in your plan/i)).not.toBeInTheDocument();
    expect(input.getAttribute('placeholder')).not.toMatch(/carried/i);
    expect(screen.getByRole('link', { name: 'View tasks' })).toHaveAttribute('href', `/today?date=${today}`);
  });

  it('shows zero remaining when saved work is completed or dropped', async () => {
    workflow = { ...workflow, tasks: [task('done', true, 1), { ...task('removed', false, 1), status: 'dropped' }] };
    mount(<New />, '/new');
    const summary = await screen.findByRole('status', { name: 'Task summary' });
    expect(summary).toHaveTextContent('0 remaining');
    expect(summary).not.toHaveTextContent('carried');
  });

  it.each(['empty', 'loading', 'error'])('does not invent task counts for an %s workflow', async (state) => {
    if (state === 'loading') vi.mocked(api.getWorkflow).mockReturnValue(new Promise(() => {}));
    if (state === 'error') vi.mocked(api.getWorkflow).mockRejectedValue(new Error('Unable to load your day'));
    mount(<New />, '/new');
    await screen.findByRole('link', { name: 'View tasks' });
    if (state === 'empty') await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled());
    if (state === 'error') await screen.findByRole('alert');
    expect(screen.queryByRole('status', { name: 'Task summary' })).not.toBeInTheDocument();
    expect(screen.queryByText(/0 remaining|0 saved tasks/)).not.toBeInTheDocument();
  });

  it('keeps repeatedly carried tasks without pressuring the user to drop them', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report', false, 1)] };
    mount(<Review />, '/review');
    expect(await screen.findByRole('button', { name: 'Tomorrow: Finish report' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/postponed before/i)).not.toBeInTheDocument();
    const drop = screen.getByRole('button', { name: 'Drop: Finish report' });
    expect(drop).toHaveAttribute('aria-pressed', 'false');
    expect(drop.className).not.toMatch(/amber/);
  });

  it('lets you close yesterday when it is still active and shows the reopen banner', async () => {
    const yesterday = previousDate(today);
    workflow = { ...workflow, date: yesterday, state: 'active', tasks: [{ ...task('meeting'), plannedForDate: yesterday }] };
    mount(<Review />, `/review?date=${yesterday}&reopen=1`);
    expect(await screen.findByText(/You are reviewing .*You can return to today/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Carry to ${dateLabel(today)}: Team meeting` })).toBeInTheDocument();
    expect(screen.queryByText('This day is in your history')).not.toBeInTheDocument();
  });

  it.each([0, 60])('lets users confirm all tasks with %i minutes available', async (availableMinutes) => {
    workflow = {
      ...workflow,
      availableMinutes,
      plan: plan({ today: [
        { ref: 'new:1', title: 'Finish report', duration: 90, badge: 'new', date: today },
        { ref: 'new:2', title: 'Clean inbox', duration: 30, badge: 'new', date: today },
      ] }),
    };
    mount(<New />, '/new');
    const confirm = await screen.findByRole('button', { name: 'Confirm plan' });
    expect(screen.getByText('Finish report')).toBeInTheDocument();
    expect(screen.getByText('Clean inbox')).toBeInTheDocument();
    expect(confirm).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.confirmDayPlan).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(api.confirmDayPlan).toHaveBeenCalledWith({ date: today, draftId: 'draft-1', version: 2 }));
  });

  it('shows estimates on Today without treating available time as a limit', async () => {
    workflow = { ...workflow, state: 'active', availableMinutes: 45 };
    vi.mocked(api.getTodayTasks).mockResolvedValue([
      { id: 'report', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 0, duration: 30 },
      { id: 'meeting', title: 'Team meeting', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 1, duration: 30 },
    ]);
    mount(<Today />, '/today');
    expect(await screen.findByText('60 min estimated remaining · 45 min available')).toBeInTheDocument();
    expect(screen.queryByText(/over capacity/i)).not.toBeInTheDocument();
  });

  it('keeps one adjustment action and a separate review action on an active Today', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report')] };
    vi.mocked(api.getTodayTasks).mockResolvedValue([{ id: 'report', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 0 }]);
    mount(<Today />, '/today');
    const cta = await screen.findByRole('link', { name: /^Adjust plan$/i });
    expect(cta).toHaveAttribute('href', `/new?date=${today}&intent=interrupt`);
    expect(screen.queryByRole('link', { name: 'Something changed →' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Adjust plan$/i })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Review day' })).toHaveAttribute('href', `/review?date=${today}`);
  });

  it('shows the full resulting plan grouped with a badge on each change', async () => {
    workflow = {
      ...workflow,
      state: 'active',
      tasks: [task('report'), task('meeting')],
      messages: [
        { id: 'u1', role: 'user', content: 'add a hotfix, push the meeting to Friday' },
        { id: 'a1', role: 'assistant', content: 'Done: the hotfix is on and the meeting moves to Friday.' },
        { id: 'e1', role: 'event', eventType: 'plan_update', content: 'Plan updated · Added Ship hotfix · Moved Team meeting', metadata: { changes: [{ ref: 'new:1', title: 'Ship hotfix', action: 'Added' }, { ref: 'meeting', title: 'Team meeting', action: 'Moved' }] } },
      ],
      plan: plan({
        today: [{ ref: 'report', taskId: 'report', title: 'Finish report', date: today }, { ref: 'new:1', title: 'Ship hotfix', badge: 'new', date: today }],
        carried: [{ ref: 'old', taskId: 'old', title: 'Fix publishing', date: today, carried: true, carriedSince: previousDate(today) }],
        otherDays: [{ ref: 'meeting', taskId: 'meeting', title: 'Team meeting', badge: 'moved', date: nextDate(today) }],
        doneCount: 2,
        counts: { new: 1, edited: 0, moved: 1, removed: 0, carried: 1 },
      }),
    };
    mount(<New />, '/new');
    const card = await screen.findByRole('region', { name: 'Proposed plan' });
    expect(card).toHaveTextContent('1 new · 1 moved · 1 carried');
    expect(screen.getByRole('region', { name: 'Today' })).toHaveTextContent(/Finish report.*Ship hotfixNew/);
    expect(screen.getByRole('region', { name: 'Carried forward' })).toHaveTextContent('Fix publishing');
    expect(screen.getByRole('region', { name: 'Other days' })).toHaveTextContent(`Team meeting${dateLabel(nextDate(today))}Moved`);
    expect(card).toHaveTextContent('Done · 2');
    expect(screen.getByRole('status', { name: 'Plan updated · Added Ship hotfix · Moved Team meeting' })).toBeInTheDocument();
  });

  it('offers Discuss in Plan from inbox items with seed context', async () => {
    workflow = { ...workflow, state: 'active' };
    vi.mocked(api.getInboxTasks).mockResolvedValue([{ id: 'inbox-1', title: 'Write brief', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: false, carriedOver: false, order: 0, duration: 30 }]);
    mount(<Capture />, '/capture');
    const options = await screen.findByRole('button', { name: 'More options for Write brief' });
    expect(screen.getByRole('button', { name: /Add to today/i })).toBeInTheDocument();
    fireEvent.keyDown(options, { key: 'ArrowDown' });
    const discuss = await screen.findByRole('menuitem', { name: 'Discuss in Plan' });
    expect(discuss.getAttribute('href')).toContain(`/new?date=${today}&intent=interrupt&taskId=inbox-1&seed=`);
    expect(decodeURIComponent(discuss.getAttribute('href') || '')).toContain('Consider adding to today: Write brief');
  });

  it('seeds interrupt chips on the planner when intent=interrupt', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report')] };
    mount(<New />, `/new?date=${today}&intent=interrupt`);
    expect(await screen.findByLabelText('Quick interruption prompts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Meeting ran over' }));
    expect(screen.getByRole('textbox', { name: 'Message about your day' })).toHaveValue('A meeting ran over and I have less time today. ');
  });

  it('retries a failed plan update once on the fallback model, then says the plan was not updated', async () => {
    const failure = () => Object.assign(new Error('I couldn\'t update the plan. Try again.'), { status: 400, code: 'plan_update_failed' });
    vi.mocked(api.streamChatMessage).mockRejectedValueOnce(failure()).mockRejectedValueOnce(failure());
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Plan my day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('I couldn’t update the plan. Try again.');
    expect(vi.mocked(api.streamChatMessage).mock.calls.map(([call]) => call.model)).toEqual(['groq/openai/gpt-oss-120b', 'groq/openai/gpt-oss-20b']);
  });
});


describe('Model resilience', () => {
  it('starts with GPT-OSS 120B and retries once with 20B after a capacity failure', async () => {
    const { toast } = await import('@/hooks/use-toast');
    vi.mocked(api.streamChatMessage)
      .mockRejectedValueOnce(Object.assign(new Error('the planning model is overloaded or timed out; try again or switch models'), { status: 503 }))
      .mockImplementationOnce(async ({ onDelta, model }) => {
        expect(model).toBe('groq/openai/gpt-oss-20b');
        onDelta?.('Fallback reply');
        workflow = { ...workflow, messages: [{ id: 'sent', role: 'user', content: 'Plan with less load' }, { id: 'reply', role: 'assistant', content: 'Fallback reply' }] };
        return { text: 'Fallback reply', workflow };
      });
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.getByRole('button', { name: 'GPT-OSS 120B' })).toBeEnabled();
    fireEvent.change(input, { target: { value: 'Plan with less load' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    await waitFor(() => expect(api.streamChatMessage).toHaveBeenCalledTimes(2));
    const models = vi.mocked(api.streamChatMessage).mock.calls.map(([call]) => call.model);
    expect(models[0]).toBe('groq/openai/gpt-oss-120b');
    expect(models[1]).toBe('groq/openai/gpt-oss-20b');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Switched to GPT-OSS 20B' }));
    await waitFor(() => expect(screen.getByText('Fallback reply')).toBeInTheDocument());
  });

});

describe('Plan composer voice', () => {
  it('hides the mic when speech recognition is unsupported', async () => {
    mount(<New />, '/new');
    await screen.findByRole('textbox', { name: 'Message about your day' });
    expect(screen.queryByRole('button', { name: 'Start voice input' })).not.toBeInTheDocument();
  });

  it('shows the mic when webkitSpeechRecognition exists', async () => {
    const FakeRecognition = vi.fn(function (this: { start: () => void; stop: () => void }) {
      this.start = vi.fn();
      this.stop = vi.fn();
    });
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
    mount(<New />, '/new');
    expect(await screen.findByRole('button', { name: 'Start voice input' })).toBeInTheDocument();
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });
});
