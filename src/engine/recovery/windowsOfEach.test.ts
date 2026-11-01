import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { RECOVERY, recoveryWindows, windowsOfEach, type LearnedWindow } from './recovery';

/**
 * Maintenance 38: each planned session's own windows, read once so the split's order can move them
 * with the session (`windowsOfEach`), as `recoveryWindows` reads them after the history: a lift new
 * to the lifter by the whole log, and what the lifter's own sessions taught. Synthetic data only.
 */

const DAY = 86_400_000;
const later = (days: number) => new Date(Date.parse(RECORD_NOW) + days * DAY).toISOString();

/** A planned session `days` ahead: the lifts as [exercise, sets], each 8 reps at 2 in reserve. */
function planned(days: number, lifts: [string, number][]): WorkoutRecord {
  const when = later(days);
  const [first] = lifts;
  const base = record(0, first![0], []);
  return {
    ...base,
    id: `planned-${days}`,
    startedAt: when,
    completedAt: when,
    entries: lifts.map(([exerciseId, sets]) => ({
      exerciseId,
      sets: Array.from({ length: sets }, () => ({
        kind: 'working' as const,
        reps: 8,
        weight: 100,
        rir: 2,
        completed: true,
      })),
    })),
  };
}

describe('the windows each planned session sets on its own', () => {
  it('reads each as recoveryWindows reads the same session after the history', () => {
    const history = [record(30, 'barbell-bench-press', [[8, 135, 2]])];
    const sessions = [planned(1, [['barbell-bench-press', 3]]), planned(3, [['back-squat', 3]])];
    const [first, second] = windowsOfEach(history, sessions);
    expect(first!.get('chest')).toEqual(recoveryWindows([...history, sessions[0]!]).get('chest'));
    expect(second!.get('quads')).toEqual(recoveryWindows([...history, ...sessions]).get('quads'));
    // Each its own: the squat day's windows hold no chest.
    expect(second!.has('chest')).toBe(false);
  });

  it('reads a lift as new by the whole log, the history before the plans', () => {
    // A month of log, the incline press never done: new to the lifter, a day more of recovery.
    const history = [record(30, 'barbell-bench-press', [[8, 135, 2]])];
    const [own] = windowsOfEach(history, [planned(1, [['incline-dumbbell-press', 3]])]);
    expect(own!.get('upper-chest')?.hours).toBe(RECOVERY.MID_HOURS.upper + RECOVERY.NEW_LIFT_HOURS);
    expect(own!.get('upper-chest')?.reasons.some((line) => line.includes('is new to you'))).toBe(
      true,
    );
  });

  it('moves each by what the lifter’s own sessions taught', () => {
    const learned = new Map<string, LearnedWindow>([
      ['chest', { muscle: 'chest', shift: -12, early: 5, rested: 5 }],
    ]) as Map<never, LearnedWindow>;
    const history = [record(30, 'barbell-bench-press', [[8, 135, 2]])];
    const [own] = windowsOfEach(history, [planned(1, [['barbell-bench-press', 3]])], { learned });
    const window = own!.get('chest')!;
    expect(window.prior).toBe(RECOVERY.MID_HOURS.upper);
    expect(window.hours).toBe(RECOVERY.MID_HOURS.upper - 12);
    expect(window.reasons).toContain('your own sessions: 12 h less');
  });
});
