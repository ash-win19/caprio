import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationDemo } from './ConversationDemo';

const motionPreference = vi.hoisted(() => ({ reduce: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => motionPreference.reduce };
});

class VisibleObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

describe('ConversationDemo', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', VisibleObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    motionPreference.reduce = false;
  });

  it('shows the confirmed Today list immediately with reduced motion', () => {
    motionPreference.reduce = true;
    render(<ConversationDemo />);

    expect(screen.getByText('Your tasks')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Today', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Carried forward', hidden: true })).toBeInTheDocument();
    expect(screen.getByText('CS problem set')).toBeInTheDocument();
    expect(screen.getByText('Call mom')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
  });

  it('plays once when visible, then offers Replay', () => {
    vi.useFakeTimers();
    render(<ConversationDemo />);

    expect(screen.getByText('What needs your attention?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(60_000); });
    const replay = screen.getByRole('button', { name: /replay/i });

    fireEvent.click(replay);
    expect(screen.queryByRole('button', { name: /replay/i })).not.toBeInTheDocument();
  });
});
