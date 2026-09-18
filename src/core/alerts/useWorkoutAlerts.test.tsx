import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = '2026-09-18T12:00:00.000Z';

interface FakeState {
  session: {
    status: 'preview' | 'active' | 'paused' | 'completed';
    rest: { endsAt: string; pausedRemaining: number | null; nextLabel: string } | null;
    completed: { startedAt: string | null; sets: { entryId: string; completedAt: string }[] };
    activeSince: string | null;
    workout: { blocks: never[] };
  } | null;
  localSettings: { restSounds: boolean; notifications: boolean };
}

const state: { current: FakeState } = {
  current: { session: null, localSettings: { restSounds: true, notifications: true } },
};
const showAlert = vi.fn(() => Promise.resolve(true));
const schedule = vi.fn();
const cancel = vi.fn();

vi.mock('../state/useAppStore', () => ({
  useAppSelector: (selector: (value: FakeState) => unknown) => selector(state.current),
}));
vi.mock('./notify', async () => {
  const actual = await vi.importActual<typeof import('./notify')>('./notify');
  return {
    ...actual,
    notifyPermission: () => 'granted',
    showAlert: (...args: unknown[]) => showAlert(...(args as [])),
    closeAlerts: () => Promise.resolve(),
  };
});
vi.mock('./restSounds', () => ({
  restSounds: {
    schedule: (...args: unknown[]) => schedule(...args),
    cancel: () => cancel(),
    unlock: () => undefined,
  },
}));

const { useWorkoutAlerts } = await import('./useWorkoutAlerts');

function at(seconds: number): string {
  return new Date(Date.parse(NOW) + seconds * 1000).toISOString();
}

function resting(seconds: number, paused = false): NonNullable<FakeState['session']> {
  return {
    status: paused ? 'paused' : 'active',
    rest: {
      endsAt: at(seconds),
      pausedRemaining: paused ? seconds : null,
      nextLabel: 'Next: Bench Press · set 2 of 4',
    },
    completed: { startedAt: NOW, sets: [{ entryId: 'e1', completedAt: NOW }] },
    activeSince: NOW,
    workout: { blocks: [] },
  };
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
}

describe('the workout alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    showAlert.mockClear();
    schedule.mockClear();
    cancel.mockClear();
    setVisibility('visible');
    state.current = { session: null, localSettings: { restSounds: true, notifications: true } };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lays the rest sounds a few seconds before the rest ends, and cancels them when it changes', () => {
    state.current.session = resting(10);
    const { rerender, unmount } = renderHook(() => useWorkoutAlerts());
    vi.advanceTimersByTime(6000);
    expect(schedule).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[0]).toBe(at(10));
    // The timer fires the moment the window opens: 3.6 seconds before the end.
    expect(schedule.mock.calls[0]?.[1]).toBeCloseTo(3.6, 1);
    // Fifteen more seconds: the earlier cues are cancelled and the new end is waited for.
    state.current = { ...state.current, session: resting(25) };
    rerender();
    expect(cancel).toHaveBeenCalled();
    unmount();
  });

  it('plays nothing with the sounds off or the rest paused', () => {
    state.current = {
      session: resting(5),
      localSettings: { restSounds: false, notifications: false },
    };
    renderHook(() => useWorkoutAlerts());
    vi.advanceTimersByTime(6000);
    expect(schedule).not.toHaveBeenCalled();
    state.current = {
      session: resting(5, true),
      localSettings: { restSounds: true, notifications: true },
    };
    renderHook(() => useWorkoutAlerts());
    vi.advanceTimersByTime(6000);
    expect(schedule).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('says the rest is over only when the app is in the background', () => {
    state.current.session = resting(10);
    renderHook(() => useWorkoutAlerts());
    vi.advanceTimersByTime(10_000);
    expect(showAlert).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(NOW));
    state.current = { ...state.current, session: resting(20) };
    setVisibility('hidden');
    renderHook(() => useWorkoutAlerts());
    vi.advanceTimersByTime(20_000);
    expect(showAlert).toHaveBeenCalledWith('Rest is over', {
      body: 'Next: Bench Press · set 2 of 4',
      tag: 'wc-rest',
    });
  });

  it('nudges once after half an hour without a logged set, in the background', () => {
    state.current.session = { ...resting(60), rest: null };
    setVisibility('hidden');
    renderHook(() => useWorkoutAlerts());
    vi.advanceTimersByTime(29 * 60_000);
    expect(showAlert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Workout still open', {
      body: '0 of 0 exercises logged. Finish it, or end it early to save the day.',
      tag: 'wc-unfinished',
    });
  });

  it('stays silent with notifications off', () => {
    state.current = {
      session: { ...resting(5), rest: null },
      localSettings: { restSounds: true, notifications: false },
    };
    setVisibility('hidden');
    renderHook(() => useWorkoutAlerts());
    vi.advanceTimersByTime(31 * 60_000);
    expect(showAlert).not.toHaveBeenCalled();
  });
});
