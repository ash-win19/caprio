import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import * as api from '@/lib/api';
import { localDate, nextDate } from '@/lib/date';
import New from './New';
import Review from './Review';
import Capture from './Capture';
import Today from './Today';

vi.mock('@/lib/api');

const today = localDate();
const task = (id: string, completed = false): api.BackendTask => ({
  id, userId: 'user', title: id === 'report' ? 'Finish report' : 'Team meeting', urgency: 'medium', duration: 30,
  source: 'manual', completed, sortOrder: 0, plannedForDate: today,
  status: completed ? 'completed' : 'planned', deferCount: 0, createdAt: today, updatedAt: today,
});
const baseWorkflow = (): api.Workflow => ({ date: today, state: 'planning', version: 2, messages: [], proposal: null, tasks: [], backlog: [], review: null });
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
  vi.clearAllMocks();
  workflow = baseWorkflow();
  vi.mocked(api.getWorkflow).mockImplementation(async () => workflow);
  vi.mocked(api.getChatSessions).mockResolvedValue([]);
  vi.mocked(api.bootstrap).mockResolvedValue({ user: { id: 'user', name: 'Ashwin', email: 'user@example.com' }, onboardingComplete: true, preferences: { briefTime: '08:00', nudgeFrequency: 'light', proactiveReprioritization: false, eodReminder: false, eodTime: '18:00', micSensitivity: 50, language: 'en', saveTranscripts: false }, categories: [], todayTasks: [], backlog: [], streak: 0 });
  vi.mocked(api.getTodayTasks).mockResolvedValue([]);
  vi.mocked(api.getInboxTasks).mockResolvedValue([]);
});

describe('Daily planning workflow', () => {
  it('restores messages and requires a separate confirmation to save a proposal', async () => {
    workflow = { ...workflow, messages: [{ id: 'message-1', role: 'user', content: 'I have an hour for the report.' }], proposal: proposal() };
    vi.mocked(api.confirmDayPlan).mockImplementation(async () => ({ ...workflow, proposal: null, state: 'active' }));
    mount(<New />, '/new');
    expect(await screen.findByText('I have an hour for the report.')).toBeInTheDocument();
    expect(screen.getByText('30 min planned · 60 min available')).toBeInTheDocument();
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

  it('shows an intentional empty plan as saved', async () => {
    workflow = { ...workflow, state: 'active' };
    mount(<Today />, '/today');
    expect(await screen.findByRole('heading', { name: 'Nothing planned for this day' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review day' })).toHaveAttribute('href', `/review?date=${today}`);
  });
});
