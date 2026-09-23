import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HoldState } from '../../core/state/session';
import { formatLogged } from '../../features/workout/setFormat';
import { SetLogger } from '../SetLogger/SetLogger';
import { HoldTimer } from './HoldTimer';

/** Maintenance 20: a hold logs seconds, with a countdown above the button. */

const target = {
  kind: 'working' as const,
  reps: [35, 60] as [number, number],
  rir: 0,
  weight: 50,
  label: 'Set 1 of 2',
};

function holdAt(startMs: number, seconds: number, extra: Partial<HoldState> = {}): HoldState {
  return {
    entryId: 'e1',
    setIndex: 0,
    seconds,
    startedAt: new Date(startMs).toISOString(),
    endsAt: new Date(startMs + seconds * 1000).toISOString(),
    pausedRemaining: null,
    held: null,
    ...extra,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the logger for a hold', () => {
  it('counts seconds, asks no reps in reserve, and logs none', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <SetLogger
        units="lb"
        target={target}
        initial={{ weight: 50, reps: 35, rir: null }}
        mode="log"
        weightStep={5}
        onCommit={onCommit}
        hold
      />,
    );
    expect(screen.getByTestId('logger-reps')).toHaveAccessibleName('Seconds, 35. Tap to type');
    expect(screen.getByTestId('reps-hint')).toHaveTextContent('Target 35 s');
    expect(screen.queryByTestId('logger-rir')).toBeNull();
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledWith({ weight: 50, reps: 35, rir: null });
  });

  it('takes the seconds a countdown filled in and keeps the weight that was turned', async () => {
    const user = userEvent.setup();
    const props = {
      units: 'lb' as const,
      target,
      initial: { weight: 50, reps: 35, rir: null },
      mode: 'log' as const,
      weightStep: 5,
      onCommit: vi.fn(),
      hold: true,
    };
    const { rerender } = render(<SetLogger {...props} filled={null} />);
    await user.click(screen.getByRole('button', { name: /^Increase weight/ }));
    expect(screen.getByTestId('logger-weight')).toHaveTextContent('55');
    rerender(<SetLogger {...props} filled={{ reps: 28, nonce: 'a|28' }} />);
    expect(screen.getByTestId('logger-reps')).toHaveTextContent('28');
    expect(screen.getByTestId('logger-weight')).toHaveTextContent('55');
    // The same fill again changes nothing the lifter has set since.
    await user.click(screen.getByRole('button', { name: 'Increase seconds' }));
    rerender(<SetLogger {...props} filled={{ reps: 28, nonce: 'a|28' }} />);
    expect(screen.getByTestId('logger-reps')).toHaveTextContent('29');
  });

  it('reads as seconds once logged', () => {
    const base = { entryId: 'e1', setIndex: 0, kind: 'working' as const, completedAt: '' };
    expect(
      formatLogged(
        { ...base, exerciseId: 'plank', reps: 45, weight: null, rir: null, skipped: false },
        'lb',
      ),
    ).toBe('45 s');
    expect(
      formatLogged(
        { ...base, exerciseId: 'farmer-carry', reps: 30, weight: 50, rir: null, skipped: false },
        'lb',
      ),
    ).toBe('50 lb × 30 s');
  });
});

describe('the hold timer', () => {
  it('offers today’s seconds, then counts down with a Stop, then says what was held', () => {
    vi.useFakeTimers({ now: Date.parse('2026-09-22T12:00:00.000Z') });
    const onStart = vi.fn();
    const onStop = vi.fn();
    const props = { seconds: 35, paused: false, onStart, onStop };
    const { rerender } = render(<HoldTimer {...props} hold={null} />);
    expect(screen.getByTestId('hold-start')).toHaveTextContent('Start hold · 35 s');
    act(() => screen.getByTestId('hold-start').click());
    expect(onStart).toHaveBeenCalledTimes(1);

    rerender(<HoldTimer {...props} hold={holdAt(Date.now(), 35)} />);
    expect(screen.getByTestId('hold-timer')).toHaveAttribute('data-state', 'running');
    expect(screen.getByTestId('hold-clock')).toHaveTextContent('0:35');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('hold-clock')).toHaveTextContent('0:25');
    act(() => screen.getByTestId('hold-stop').click());
    expect(onStop).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(26_000);
    });
    expect(screen.getByTestId('hold-timer')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('hold-held')).toHaveTextContent('Held 35 s');
    expect(screen.getByTestId('hold-start')).toHaveTextContent('Start again · 35 s');
  });

  it('buzzes once as a countdown runs out, and never again for it after coming back', () => {
    vi.useFakeTimers({ now: Date.parse('2026-09-22T12:00:00.000Z') });
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const running = holdAt(Date.now(), 5);
    const props = { seconds: 5, paused: false, onStart: vi.fn(), onStop: vi.fn() };
    const { unmount } = render(<HoldTimer {...props} hold={running} />);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
    unmount();
    // Back from another tab: the countdown that already ran out stays quiet.
    render(<HoldTimer {...props} hold={running} />);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('freezes while the workout is paused, and nothing starts until it resumes', () => {
    vi.useFakeTimers({ now: Date.parse('2026-09-22T12:00:00.000Z') });
    const frozen = holdAt(Date.now() - 5_000, 30, { pausedRemaining: 25 });
    const { rerender } = render(
      <HoldTimer hold={frozen} seconds={30} paused onStart={vi.fn()} onStop={vi.fn()} />,
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('hold-clock')).toHaveTextContent('0:25');
    expect(screen.getByText('Hold paused')).toBeInTheDocument();
    rerender(<HoldTimer hold={null} seconds={30} paused onStart={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByTestId('hold-start')).toBeDisabled();
  });
});
