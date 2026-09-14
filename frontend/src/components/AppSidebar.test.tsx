import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';
import { useWorkflow } from '@/lib/queries';
import { ConversationSidebar } from './ConversationSidebar';
import AppLayout from '@/layouts/AppLayout';
import { useSidebarStore } from '@/lib/sidebar';
import { localDate, previousDate } from '@/lib/date';

vi.mock('@/lib/store', () => ({
  useAppStore: vi.fn((selector) => selector({ user: { name: 'Ashwin Shanmugam', email: 'ashwin@example.com', categories: [] } })),
}));

vi.mock('@/lib/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    useWorkflow: vi.fn((date: string) => ({ data: { date, state: 'planning', version: 1, messages: [], proposal: null, availableMinutes: null, tasks: [], backlog: [], review: null }, isLoading: false, error: null })),
  };
});

const mountSidebar = () => render(<MemoryRouter initialEntries={['/today']}><AppSidebar /></MemoryRouter>);
const stored = () => JSON.parse(localStorage.getItem('caprio-sidebar') || '{}').state?.collapsed;

beforeEach(() => {
  localStorage.clear();
  useSidebarStore.setState({ collapsed: false });
  vi.mocked(useWorkflow).mockImplementation((date: string) => ({ data: { date, state: 'planning', version: 1, messages: [], proposal: null, availableMinutes: null, tasks: [], backlog: [], review: null }, isLoading: false, error: null } as ReturnType<typeof useWorkflow>));
});

describe('AppSidebar', () => {
  it('always offers a toggle, collapses to a rail that keeps every destination, and expands again', () => {
    mountSidebar();
    expect(screen.getByRole('link', { name: 'Today' })).toHaveTextContent('Today');
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument();

    const collapseButton = screen.getByRole('button', { name: 'Collapse sidebar' });
    collapseButton.focus();
    fireEvent.click(collapseButton);

    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveFocus();
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument();
    for (const name of ['Today', 'Plan', 'Inbox', 'Review', 'History', 'Settings']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('title', name);
    }
    expect(screen.getByRole('link', { name: "Open Ashwin Shanmugam's profile" })).toBeInTheDocument();
    expect(useSidebarStore.getState().collapsed).toBe(true);
    expect(stored()).toBe(true);

    fireEvent.click(expand);

    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(collapse).toHaveFocus();
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Today' })).toHaveTextContent('Today');
    expect(stored()).toBe(false);
  });

  it('toggles with Cmd or Ctrl+B, moving focus only when it was inside the sidebar', () => {
    render(<MemoryRouter initialEntries={['/today']}><AppSidebar /><input aria-label="Message" /></MemoryRouter>);
    const input = screen.getByRole('textbox', { name: 'Message' });
    input.focus();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(useSidebarStore.getState().collapsed).toBe(true);
    expect(input).toHaveFocus();
    fireEvent.keyDown(window, { key: 'B', ctrlKey: true });
    expect(useSidebarStore.getState().collapsed).toBe(false);
    expect(input).toHaveFocus();

    screen.getByRole('link', { name: 'Inbox' }).focus();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'b', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'b' });
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('remembers the choice for the next visit', () => {
    localStorage.setItem('caprio-sidebar', JSON.stringify({ state: { collapsed: true }, version: 0 }));
    void useSidebarStore.persist.rehydrate();
    mountSidebar();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('shares one preference with the conversation sidebar', () => {
    useSidebarStore.setState({ collapsed: true });
    render(<MemoryRouter><ConversationSidebar sessions={[]} selectedDate="2026-09-06" isLoading={false} onSelect={vi.fn()} onToday={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(useSidebarStore.getState().collapsed).toBe(false);
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });

  it('moves the page content with the sidebar', () => {
    render(<MemoryRouter initialEntries={['/today']}><Routes><Route element={<AppLayout />}><Route path="/today" element={<p>Plan for today</p>} /></Route></Routes></MemoryRouter>);
    expect(screen.getByRole('main')).toHaveClass('md:ml-[240px]');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('main')).toHaveClass('md:ml-16');
    expect(screen.getByText('Plan for today')).toBeInTheDocument();
  });

  it('emphasizes Review when today’s workflow is active', () => {
    const today = localDate();
    vi.mocked(useWorkflow).mockImplementation((date: string) => ({
      data: {
        date,
        state: date === today ? 'active' : 'closed',
        version: 1,
        messages: [],
        proposal: null,
        availableMinutes: null,
        tasks: date === today ? [{ id: 'a', completed: false }, { id: 'b', completed: true }] : [],
        backlog: [],
        review: null,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useWorkflow>));
    mountSidebar();
    expect(screen.getByLabelText('1 unfinished')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review/ })).toHaveAttribute('href', '/review');
  });

  it('points Review at yesterday when that day is still open', () => {
    const today = localDate();
    const yesterday = previousDate(today);
    vi.mocked(useWorkflow).mockImplementation((date: string) => ({
      data: {
        date,
        state: date === yesterday ? 'active' : 'planning',
        version: 1,
        messages: [],
        proposal: null,
        availableMinutes: null,
        tasks: date === yesterday ? [{ id: 'a', completed: false }] : [],
        backlog: [],
        review: null,
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useWorkflow>));
    mountSidebar();
    expect(screen.getByRole('link', { name: /Review/ })).toHaveAttribute('href', `/review?date=${yesterday}&reopen=1`);
    expect(screen.getByLabelText('1 unfinished')).toBeInTheDocument();
  });
});
