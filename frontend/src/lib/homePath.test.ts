import { describe, expect, it } from 'vitest';
import { morningHomePath, shouldForceOpenDayReview } from './homePath';

describe('morningHomePath', () => {
  it('forces review when yesterday is still active', () => {
    expect(morningHomePath({ today: '2026-09-13', oldestUnclosedDate: '2026-09-12', todayState: 'planning' })).toBe(
      '/review?date=2026-09-12&reopen=1',
    );
  });

  it('sends an active today to /today', () => {
    expect(morningHomePath({ today: '2026-09-13', oldestUnclosedDate: null, todayState: 'active' })).toBe('/today');
  });

  it('defaults to plan when today is not confirmed', () => {
    expect(morningHomePath({ today: '2026-09-13', oldestUnclosedDate: null, todayState: 'planning' })).toBe('/new');
    expect(morningHomePath({ today: '2026-09-13' })).toBe('/new');
  });

  it('opens the summary when today is closed', () => {
    expect(morningHomePath({ today: '2026-09-13', todayState: 'closed' })).toBe('/today');
  });

  it('ignores an invalid or future recovery date', () => {
    expect(morningHomePath({ today: '2026-09-13', oldestUnclosedDate: '2026-09-14' })).toBe('/new');
    expect(morningHomePath({ today: '2026-09-13', oldestUnclosedDate: 'invalid' })).toBe('/new');
  });
});

describe('shouldForceOpenDayReview', () => {
  it('blocks /new and /today for local today', () => {
    expect(shouldForceOpenDayReview('/new', '', '2026-09-13', '2026-09-12')).toBe('/review?date=2026-09-12&reopen=1');
    expect(shouldForceOpenDayReview('/today', '', '2026-09-13', '2026-09-12')).toBe('/review?date=2026-09-12&reopen=1');
  });

  it('allows other dates and non-home paths', () => {
    expect(shouldForceOpenDayReview('/new', '?date=2026-09-11', '2026-09-13', '2026-09-12')).toBeNull();
    expect(shouldForceOpenDayReview('/review', '', '2026-09-13', '2026-09-12')).toBeNull();
    expect(shouldForceOpenDayReview('/new', '', '2026-09-13', null)).toBeNull();
  });
});
