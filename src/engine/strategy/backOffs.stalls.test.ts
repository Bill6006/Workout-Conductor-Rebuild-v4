import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { coachingPolicy } from '../coach/experience';
import { detectStalls, reconcileRoutes } from './plateau';
import { record, RECORD_NOW, type SetSpec } from '../../test/records';
import { profileOf } from '../../test/backOffs';

/**
 * The fifth review of round N, in the coach's stalls. A lift main one day and secondary another
 * (the row on the pull and the upper day of the default split) has a straight day at the
 * back-offs' load between its top sets, saved as such a day (`atBackOffs`); its top set reads past
 * it (the fourth review), and stalls are to read the top set alone (the round's report). The
 * coach's stall window (`detectStalls`, four exposures for an intermediate) counts those days as
 * exposures, at the back-offs' load's lower estimated max: with the top set held at 160 lb for four
 * pull days, the stall is seen after an upper day and gone after a pull day, and a route opened on
 * an upper day's estimate closes at the next pull day as "moved", nothing having moved.
 * Synthetic data only.
 */

const ROW = 'barbell-row';
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.parse(RECORD_NOW) - daysAgo * DAY).toISOString();

function pullDay(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId: 'pull-arms' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, index) => {
    set.tier = index === 0 ? 'top' : 'back-off';
    set.targetRir = index === 0 ? 1 : 2;
  });
  return done;
}

function upperDay(daysAgo: number, weight: number): WorkoutRecord {
  const done = record(
    daysAgo,
    ROW,
    [
      [5, weight, 2],
      [5, weight, 2],
      [5, weight, 2],
    ],
    [4, 6],
    2,
    { templateId: 'upper' },
  );
  done.entries[0]!.role = 'secondary-strength';
  done.entries[0]!.atBackOffs = true;
  return done;
}

/** The top set held at 160 x 5 (nothing in reserve each time), the upper days at 150 between. */
const held = (): WorkoutRecord[] => [
  pullDay(
    28,
    [5, 160, 0],
    [
      [5, 150, 2],
      [5, 150, 2],
      [5, 150, 2],
    ],
  ),
  upperDay(25, 150),
  pullDay(
    21,
    [5, 160, 0],
    [
      [5, 150, 2],
      [5, 150, 2],
      [5, 150, 2],
    ],
  ),
  upperDay(18, 150),
  pullDay(
    14,
    [5, 160, 0],
    [
      [5, 150, 2],
      [5, 150, 2],
      [5, 150, 2],
    ],
  ),
  upperDay(11, 150),
  pullDay(
    7,
    [5, 160, 0],
    [
      [5, 150, 2],
      [5, 150, 2],
      [5, 150, 2],
    ],
  ),
];

describe('the coach’s stalls on a lift main one day and secondary another', () => {
  const policy = coachingPolicy('intermediate');
  const profile = profileOf();

  it('four pull days with the top set held: a stall, read as the next upper day reads it', () => {
    const afterUpper = [...held(), upperDay(4, 150)];
    const afterPull = held();
    const rowStall = (history: WorkoutRecord[]) =>
      detectStalls(history, profile, policy).find((stall) => stall.exerciseId === ROW);
    // After an upper day the window reads a stall.
    expect(rowStall(afterUpper)).toBeDefined();
    // On 7f23a26: after the pull day the window's oldest exposure is an upper day at the
    // back-offs' load, and the held top set "improves" on it: no stall.
    expect(rowStall(afterPull)).toBeDefined();
  });

  it('a route opened after an upper day stays open through a pull day with the top set held', () => {
    const afterUpper = [...held(), upperDay(4, 150)];
    const stalls = detectStalls(afterUpper, profile, policy);
    expect(stalls.some((stall) => stall.exerciseId === ROW)).toBe(true);
    const opened = reconcileRoutes(
      { id: 'coach-routes', routes: {} } as Parameters<typeof reconcileRoutes>[0],
      stalls,
      afterUpper,
      policy,
      at(4),
    );
    expect(opened.routes.routes[ROW]).toBeDefined();
    // The next pull day: the top set held at 160 again.
    const next = [
      ...afterUpper,
      pullDay(
        1,
        [5, 160, 0],
        [
          [5, 150, 2],
          [5, 150, 2],
          [5, 150, 2],
        ],
      ),
    ];
    const after = reconcileRoutes(
      opened.routes,
      detectStalls(next, profile, policy),
      next,
      policy,
      at(1),
    );
    // On 7f23a26: "Estimated max moved from 175 to 186.7; route closed."
    expect(after.events.filter((event) => event.kind === 'resolved')).toEqual([]);
  });
});
