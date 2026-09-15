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

vi.mock('@/lib/api');
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const today = localDate();
const task = (id: string, completed = false, deferCount = 0): api.BackendTask => ({
  id, userId: 'user', title: id === 'report' ? 'Finish report' : 'Team meeting', urgency: 'medium', duration: 30,
  source: 'manual', completed, sortOrder: 0, plannedForDate: today,
  status: completed ? 'completed' : 'planned', deferCount, createdAt: today, updatedAt: today,
});
const baseWorkflow = (): api.Workflow => ({ date: today, state: 'planning', version: 2, messages: [], proposal: null, availableMinutes: null, tasks: [], backlog: [], review: null });
const proposal = (): api.PlanProposal => ({ id: 'proposal-1', summary: 'Protect time for your report.', availableMinutes: 60, tasks: [{ title: 'Finish report', duration: 30, urgency: 'high', disposition: 'today', reason: 'Due this afternoon.' }] });
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
  it('restores messages and requires a separate confirmation to save a proposal', async () => {
    workflow = { ...workflow, messages: [{ id: 'message-1', role: 'user', content: 'I have an hour for the report.' }], proposal: proposal() };
    vi.mocked(api.confirmDayPlan).mockImplementation(async () => ({ ...workflow, proposal: null, state: 'active' }));
    mount(<New />, '/new');
    expect(await screen.findByText('I have an hour for the report.')).toBeInTheDocument();
    expect(screen.getByText('30 min planned')).toBeInTheDocument();
    expect(screen.getByText('60 min available')).toBeInTheDocument();
    expect(api.confirmDayPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan' }));
    expect(await screen.findByText('Saved plan destination')).toBeInTheDocument();
    expect(api.confirmDayPlan).toHaveBeenCalledWith({ date: today, proposalId: 'proposal-1', version: 2 });
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
    fireEvent.click(screen.getByRole('link', { name: 'View day' }));
    expect(screen.queryByText('Saved plan destination')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled());
    fireEvent.click(screen.getByRole('link', { name: 'View day' }));
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
    workflow = { ...workflow, proposal: proposal() };
    vi.mocked(api.discardDayPlan).mockImplementation(async () => { workflow = { ...workflow, proposal: null }; return workflow; });
    mount(<New />, '/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Discard proposal' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Proposed plan' })).not.toBeInTheDocument());
    expect(api.discardDayPlan).toHaveBeenCalledWith({ date: today, proposalId: 'proposal-1', version: 2 });
    expect(api.confirmDayPlan).not.toHaveBeenCalled();
  });

  it('keeps a historical conversation read-only', async () => {
    workflow = { ...workflow, date: '2020-01-01', proposal: proposal(), messages: [{ id: 'past', role: 'assistant', content: 'Your old plan.' }] };
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
    const done = await screen.findByRole('button', { name: 'Done: Finish report' });
    expect(done).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tomorrow: Finish report' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Drop: Finish report' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow: Team meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
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

  it('saves an inbox task without immediately adding it to today', async () => {
    vi.mocked(api.createTask).mockResolvedValue(task('report'));
    mount(<Capture />, '/capture');
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Task' }), { target: { value: 'Finish report' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to inbox' }));
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

  it('nudges closing an active day with unfinished work', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report')] };
    vi.mocked(api.getTodayTasks).mockResolvedValue([{ id: 'report', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 0 }]);
    mount(<Today />, '/today');
    expect(await screen.findByRole('link', { name: /Review day/i })).toHaveAttribute('href', `/review?date=${today}`);
    expect(screen.getByRole('link', { name: 'Review day →' })).toHaveAttribute('href', `/review?date=${today}`);
  });

  it('groups carried-over tasks separately on Today', async () => {
    workflow = { ...workflow, state: 'active' };
    vi.mocked(api.getTodayTasks).mockResolvedValue([
      { id: 'carry', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: false, carriedOver: true, order: 0 },
      { id: 'fresh', title: 'Team meeting', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 1 },
    ]);
    mount(<Today />, '/today');
    expect(await screen.findByRole('heading', { name: /Carried over/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Priorities/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark Finish report complete' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark Team meeting complete' })).toBeInTheDocument();
  });

  it('explains one-hop carry and drop outcomes on Review', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('meeting')] };
    mount(<Review />, '/review');
    expect(await screen.findByText(/Tomorrow moves the task to/i)).toBeInTheDocument();
    expect(screen.getByText(/Moving it again requires another explicit carry choice/i)).toBeInTheDocument();
    expect(screen.getByText(/Drop removes it from the plan/i)).toBeInTheDocument();
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
  it('shows a carried-from-yesterday chip above the plan composer', async () => {
    workflow = { ...workflow, tasks: [task('report', false, 1)] };
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/1 carried from yesterday/i));
    expect(input.getAttribute('placeholder') || '').toMatch(/carried task/i);
  });

  it('warns about postponement and highlights Drop for already carried tasks on Review', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report', false, 1)] };
    mount(<Review />, '/review');
    expect(await screen.findByText(/postponed before/i)).toBeInTheDocument();
    expect(screen.getByText(/explicitly carry it one more day/i)).toBeInTheDocument();
    const drop = screen.getByRole('button', { name: 'Drop: Finish report' });
    expect(drop).toHaveAttribute('aria-pressed', 'false');
    expect(drop.className).toMatch(/amber/);
  });

  it('lets you close yesterday when it is still active and shows the reopen banner', async () => {
    const yesterday = previousDate(today);
    workflow = { ...workflow, date: yesterday, state: 'active', tasks: [{ ...task('meeting'), plannedForDate: yesterday }] };
    mount(<Review />, `/review?date=${yesterday}&reopen=1`);
    expect(await screen.findByText(/You are reviewing .*You can return to today/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Carry to ${dateLabel(today)}: Team meeting` })).toBeInTheDocument();
    expect(screen.queryByText('This day is in your history')).not.toBeInTheDocument();
  });

  it('hard-blocks confirm when the draft is over capacity', async () => {
    workflow = {
      ...workflow,
      proposal: {
        ...proposal(),
        availableMinutes: 60,
        tasks: [
          { title: 'Finish report', duration: 90, urgency: 'high', disposition: 'today', reason: 'Due this afternoon.' },
          { title: 'Clean inbox', duration: 30, urgency: 'low', disposition: 'today', reason: 'Would also take time.' },
        ],
      },
    };
    mount(<New />, '/new');
    expect(await screen.findByRole('alert')).toHaveTextContent('Plan is 1h over your 1h day');
    expect(screen.getByRole('button', { name: 'Confirm plan' })).toBeDisabled();
    expect(api.confirmDayPlan).not.toHaveBeenCalled();
  });

  it('shows remaining minutes on Today and warns when over available capacity', async () => {
    workflow = { ...workflow, state: 'active', availableMinutes: 45 };
    vi.mocked(api.getTodayTasks).mockResolvedValue([
      { id: 'report', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 0, duration: 30 },
      { id: 'meeting', title: 'Team meeting', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 1, duration: 30 },
    ]);
    mount(<Today />, '/today');
    expect(await screen.findByText(/60 min remaining · 45 min available · over capacity/i)).toBeInTheDocument();
  });

  it('shows Something changed CTA on an active today with unfinished work', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report')] };
    vi.mocked(api.getTodayTasks).mockResolvedValue([{ id: 'report', title: 'Finish report', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: true, carriedOver: false, order: 0 }]);
    mount(<Today />, '/today');
    const cta = await screen.findByRole('link', { name: /^Adjust plan$/i });
    expect(cta).toHaveAttribute('href', `/new?date=${today}&intent=interrupt`);
    expect(screen.getByRole('link', { name: 'Something changed →' })).toHaveAttribute('href', `/new?date=${today}&intent=interrupt`);
    expect(screen.getByRole('link', { name: 'Review day →' })).toHaveAttribute('href', `/review?date=${today}`);
  });

  it('shows a kept/added/deferred diff when revising an active day proposal', async () => {
    workflow = {
      ...workflow,
      state: 'active',
      tasks: [task('report'), task('meeting')],
      proposal: {
        id: 'proposal-2',
        summary: 'Protect the report and park the meeting.',
        availableMinutes: 60,
        tasks: [
          { id: 'report', title: 'Finish report', duration: 30, urgency: 'high', disposition: 'today', reason: 'Still due.' },
          { title: 'Ship hotfix', duration: 30, urgency: 'high', disposition: 'today', reason: 'New interruption.' },
          { id: 'meeting', title: 'Team meeting', duration: 30, urgency: 'medium', disposition: 'backlog', reason: 'Can wait.' },
        ],
      },
    };
    mount(<New />, '/new');
    expect(await screen.findByRole('region', { name: 'Proposal changes' })).toBeInTheDocument();
    expect(screen.getByText(/Kept · 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Added · 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Deferred or removed · 1/i)).toBeInTheDocument();
    expect(screen.getAllByText('Ship hotfix').length).toBeGreaterThan(0);
  });

  it('offers Discuss in Plan from inbox items with seed context', async () => {
    workflow = { ...workflow, state: 'active' };
    vi.mocked(api.getInboxTasks).mockResolvedValue([{ id: 'inbox-1', title: 'Write brief', urgency: 'medium', category: 'Uncategorized', completed: false, addedToday: false, carriedOver: false, order: 0, duration: 30 }]);
    mount(<Capture />, '/capture');
    const discuss = await screen.findByRole('link', { name: 'Discuss in Plan' });
    expect(discuss.getAttribute('href')).toContain(`/new?date=${today}&intent=interrupt&seed=`);
    expect(decodeURIComponent(discuss.getAttribute('href') || '')).toContain('Consider adding to today: Write brief');
    expect(screen.getByRole('button', { name: /Add to today/i })).toBeInTheDocument();
  });

  it('seeds interrupt chips on the planner when intent=interrupt', async () => {
    workflow = { ...workflow, state: 'active', tasks: [task('report')] };
    mount(<New />, `/new?date=${today}&intent=interrupt`);
    expect(await screen.findByLabelText('Quick interruption prompts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Meeting ran over' }));
    expect(screen.getByRole('textbox', { name: 'Message about your day' })).toHaveValue('A meeting ran over and I have less time today. ');
  });

  it('surfaces planner validation failures as readable chat errors', async () => {
    vi.mocked(api.streamChatMessage).mockRejectedValueOnce(new Error('assistant response failed validation: proposal omitted an unfinished task'));
    mount(<New />, '/new');
    const input = await screen.findByRole('textbox', { name: 'Message about your day' });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Plan my day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/wasn’t complete enough to save/i);
  });
});


describe('Model resilience', () => {
  it('retries once with Groq after a capacity failure and notes the switch', async () => {
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
    fireEvent.change(input, { target: { value: 'Plan with less load' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));
    await waitFor(() => expect(api.streamChatMessage).toHaveBeenCalledTimes(2));
    const models = vi.mocked(api.streamChatMessage).mock.calls.map(([call]) => call.model);
    expect(models[0]).toBe('google/gemini-3.7-flash');
    expect(models[1]).toBe('groq/openai/gpt-oss-20b');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Switched to Groq' }));
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
