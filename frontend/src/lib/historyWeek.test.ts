import { describe, expect, it } from 'vitest';
import type { ChatSession } from './api';
import { dayOutcomeLine, summarizeWeek, weekDates } from './historyWeek';

function session(partial: Partial<ChatSession> & Pick<ChatSession, 'sessionDate'>): ChatSession {
  return {
    title: 'Daily plan',
    messageCount: 0,
    updatedAt: '2026-09-13T12:00:00Z',
    ...partial,
  };
}

describe('historyWeek', () => {
  it('builds seven local dates ending at the given day', () => {
    expect(weekDates('2026-09-13')).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('aggregates closed-day outcomes inside the week window only', () => {
    const sessions = [
      session({ sessionDate: '2026-09-13', state: 'closed', completedCount: 2, carriedCount: 1, droppedCount: 0, plannedCount: 3 }),
      session({ sessionDate: '2026-09-12', state: 'closed', completedCount: 1, carriedCount: 0, droppedCount: 2, plannedCount: 3 }),
      session({ sessionDate: '2026-09-11', state: 'active', completedCount: 9, carriedCount: 9, droppedCount: 9 }),
      session({ sessionDate: '2026-09-01', state: 'closed', completedCount: 50, carriedCount: 50, droppedCount: 50 }),
    ];
    expect(summarizeWeek(sessions, '2026-09-13')).toEqual({
      closedDays: 2,
      done: 3,
      carried: 1,
      dropped: 2,
      hasAnyDay: true,
    });
  });

  it('reports an empty week when nothing closed recently', () => {
    expect(summarizeWeek([session({ sessionDate: '2026-09-13', state: 'planning' })], '2026-09-13')).toEqual({
      closedDays: 0,
      done: 0,
      carried: 0,
      dropped: 0,
      hasAnyDay: true,
    });
    expect(summarizeWeek([], '2026-09-13').closedDays).toBe(0);
  });

  it('formats per-day outcomes only for closed days', () => {
    expect(dayOutcomeLine(session({ sessionDate: '2026-09-13', state: 'active' }))).toBeNull();
    expect(
      dayOutcomeLine(
        session({
          sessionDate: '2026-09-13',
          state: 'closed',
          plannedCount: 4,
          completedCount: 2,
          carriedCount: 1,
          droppedCount: 1,
        }),
      ),
    ).toBe('4 planned · 2 done · 1 carried · 1 dropped');
  });
});
