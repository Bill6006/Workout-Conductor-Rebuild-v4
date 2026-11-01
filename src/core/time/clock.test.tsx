import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './clock';

/**
 * The owner's report of 2026-11-01: back in front, the app reads the time again at once, so a new
 * day's plan never waits for the minute's timer, which waits while the app is in the background.
 */

function Now() {
  return <span data-testid="now">{useNow()}</span>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the clock, back in front', () => {
  it('reads the time again at once on focus, on pageshow and when the page shows again', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    render(<Now />);
    const shown = () => Number(screen.getByTestId('now').textContent);
    const later = (iso: string, event: () => void) => {
      vi.setSystemTime(new Date(iso));
      act(event);
      expect(shown()).toBe(Date.parse(iso));
    };
    later('2026-09-09T12:00:00.000Z', () => window.dispatchEvent(new Event('focus')));
    later('2026-09-10T12:00:00.000Z', () => window.dispatchEvent(new Event('pageshow')));
    later('2026-09-11T12:00:00.000Z', () => document.dispatchEvent(new Event('visibilitychange')));
  });
});
