import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { localDate, previousDate } from '@/lib/date';
import Momentum from './Momentum';

vi.mock('@/lib/api');

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Momentum />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Momentum history insight', () => {
  it('renders last-7-days chips from mocked closed sessions', async () => {
    const today = localDate();
    const yesterday = previousDate(today);
    vi.mocked(api.getChatSessions).mockResolvedValue([
      {
        sessionDate: today,
        title: 'Ship history',
        messageCount: 4,
        updatedAt: `${today}T18:00:00Z`,
        state: 'closed',
        plannedCount: 3,
        completedCount: 2,
        carriedCount: 1,
        droppedCount: 0,
      },
      {
        sessionDate: yesterday,
        title: 'Catch up',
        messageCount: 2,
        updatedAt: `${yesterday}T18:00:00Z`,
        state: 'closed',
        plannedCount: 2,
        completedCount: 0,
        carriedCount: 1,
        droppedCount: 1,
      },
    ]);

    mount();

    expect(await screen.findByLabelText('Last 7 days')).toBeInTheDocument();
    const strip = screen.getByLabelText('Last 7 days');
    expect(strip).toHaveTextContent('Closed');
    expect(strip).toHaveTextContent('Done');
    expect(strip).toHaveTextContent('Carried');
    expect(strip).toHaveTextContent('Dropped');
    // Closed 2 · Done 2 · Carried 2 · Dropped 1
    const counts = Array.from(strip.querySelectorAll('dd')).map((node) => node.textContent);
    expect(counts).toEqual(['2', '2', '2', '1']);
    expect(screen.getByText('3 planned · 2 done · 1 carried · 0 dropped')).toBeInTheDocument();
    expect(screen.getByText('2 planned · 0 done · 1 carried · 1 dropped')).toBeInTheDocument();
  });

  it('shows an honest empty week when nothing is closed yet', async () => {
    vi.mocked(api.getChatSessions).mockResolvedValue([
      {
        sessionDate: localDate(),
        title: 'Still planning',
        messageCount: 1,
        updatedAt: `${localDate()}T10:00:00Z`,
        state: 'planning',
      },
    ]);

    mount();

    expect(await screen.findByText('No closed days yet')).toBeInTheDocument();
    expect(screen.getByText(/Close a day to see what you finished/i)).toBeInTheDocument();
  });
});
