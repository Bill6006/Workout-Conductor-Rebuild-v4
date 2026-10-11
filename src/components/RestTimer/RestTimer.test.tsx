import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RestState } from '../../core/state/session';
import { RestTimer } from './RestTimer';

/**
 * Maintenance 29, the owner's item 7: the rest's buzzes go with its sounds, under the one switch,
 * from the app-wide alerts. The timer on the screen shows the end and no longer buzzes on its own,
 * so a rest never buzzes twice, nor with the switch off.
 */
describe('the rest timer', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('shows the end of the rest without a buzz of its own', () => {
    vi.useFakeTimers({ now: Date.parse('2026-09-22T12:00:00.000Z') });
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const start = Date.now();
    const rest: RestState = {
      entryId: 'e1',
      setIndex: 0,
      seconds: 5,
      startedAt: new Date(start).toISOString(),
      endsAt: new Date(start + 5_000).toISOString(),
      pausedRemaining: null,
      nextLabel: 'Next: Bench Press · set 2 of 4',
    };
    render(
      <RestTimer rest={rest} paused={false} onAdjust={() => undefined} onSkip={() => undefined} />,
    );
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.getByTestId('rest-timer')).toHaveAttribute('data-done', 'true');
    expect(vibrate).not.toHaveBeenCalled();
  });
});
