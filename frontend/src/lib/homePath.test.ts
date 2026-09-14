import { describe, expect, it } from 'vitest';
import { morningHomePath, shouldForceYesterdayReview } from './homePath';

describe('morningHomePath', () => {
  it('forces review when yesterday is still active', () => {
    expect(morningHomePath({ today: '2026-09-13', yesterdayState: 'active', todayState: 'planning' })).toBe(
      '/review?date=2026-09-12&reopen=1',
    );
  });

  it('sends an active today to /today', () => {
    expect(morningHomePath({ today: '2026-09-13', yesterdayState: 'closed', todayState: 'active' })).toBe('/today');
  });

  it('defaults to plan when today is not confirmed', () => {
    expect(morningHomePath({ today: '2026-09-13', yesterdayState: 'planning', todayState: 'planning' })).toBe('/new');
    expect(morningHomePath({ today: '2026-09-13' })).toBe('/new');
  });
});

describe('shouldForceYesterdayReview', () => {
  it('blocks /new and /today for local today', () => {
    expect(shouldForceYesterdayReview('/new', '', '2026-09-13', 'active')).toBe('/review?date=2026-09-12&reopen=1');
    expect(shouldForceYesterdayReview('/today', '', '2026-09-13', 'active')).toBe('/review?date=2026-09-12&reopen=1');
  });

  it('allows other dates and non-home paths', () => {
    expect(shouldForceYesterdayReview('/new', '?date=2026-09-11', '2026-09-13', 'active')).toBeNull();
    expect(shouldForceYesterdayReview('/review', '', '2026-09-13', 'active')).toBeNull();
    expect(shouldForceYesterdayReview('/new', '', '2026-09-13', 'closed')).toBeNull();
  });
});
