import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocalDay } from './useLocalDay';
import { isValidDate, nextDate, previousDate } from './date';

afterEach(() => vi.useRealTimers());

describe('local calendar navigation', () => {
  it('refreshes today at midnight and when the app wakes on another day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 23, 59, 59));
    const { result } = renderHook(useLocalDay);
    expect(result.current).toBe('2026-09-15');
    act(() => vi.advanceTimersByTime(1100));
    expect(result.current).toBe('2026-09-16');
    vi.setSystemTime(new Date(2026, 8, 18, 9));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe('2026-09-18');
  });

  it('crosses daylight-saving, month, leap-day and year boundaries by calendar day', () => {
    for (const [from, to] of [['2026-03-08', '2026-03-09'], ['2026-11-01', '2026-11-02'], ['2028-02-28', '2028-02-29'], ['2028-02-29', '2028-03-01'], ['2026-12-31', '2027-01-01']]) {
      expect(nextDate(from)).toBe(to);
      expect(previousDate(to)).toBe(from);
    }
    expect(isValidDate('2026-02-29')).toBe(false);
  });
});
