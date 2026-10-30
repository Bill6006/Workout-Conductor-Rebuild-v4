import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../core/state/session';
import { buildWorkoutRecord } from '../../core/state/workoutRecordBuilder';
import { loadingFor } from '../loading/loading';
import { LoggedExerciseSchema, type WorkoutRecord } from '../../core/validation/workoutRecord';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { WorkoutEntrySchema } from '../workout/workoutSchema';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { entryOf, gym, plan, shape } from '../../test/backOffs';
import { pastBackOffDays, ranOnTopSet, withDropsToday } from './backOffs';

/**
 * Maintenance 32, the owner's item 11 (the fourth review of round N): a straight day at the
 * back-offs' load after a session on the structure is saved as one (`atBackOffs`), so the lift's
 * next top set reads past it as past its back-offs, through two such days running at most: past
 * them the lift has left the structure, and its straight sessions are its own. A saved copy's
 * straight sets are the lifter's own. An unreadable mark is dropped, never the exercise.
 * Synthetic data only.
 */

const ROW = 'barbell-row';

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId: 'pull-arms' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

/** A straight session of the row, `daysAgo`, at the back-offs' load or of its own. */
function straight(daysAgo: number, weight: number, atBackOffs: boolean): WorkoutRecord {
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
  if (atBackOffs) done.entries[0]!.atBackOffs = true;
  return done;
}

const pulled = () =>
  structured(
    9,
    [5, 190, 1],
    [
      [5, 180, 2],
      [5, 180, 2],
      [5, 180, 2],
    ],
  );

describe('a straight day at the back-offs’ load, saved as one, the fourth review of round N', () => {
  it('the upper day’s row after the pull day: marked in the plan and saved so', () => {
    const workout = plan([pulled()], undefined, { templateId: 'upper' });
    const row = entryOf(workout, ROW);
    expect(row.role).toBe('secondary-strength');
    expect(row.atBackOffs).toBe(true);
    expect(shape(row).every((set) => set[2] === 'straight')).toBe(true);
    const session = {
      workout,
      constraints: emptyConstraints(),
      completed: {
        ...emptyCompleted(),
        startedAt: RECORD_NOW,
        sets: row.sets
          .filter((set) => set.kind === 'working')
          .map((set) => ({
            entryId: row.id,
            exerciseId: row.exerciseId,
            setIndex: set.index,
            kind: 'working',
            reps: 5,
            weight: set.targetWeight,
            rir: 2,
            completedAt: RECORD_NOW,
          })),
      },
    } as unknown as WorkoutSession;
    const saved = buildWorkoutRecord(session, {
      now: RECORD_NOW,
      elapsedSeconds: 900,
      rating: null,
      endedEarly: true,
    });
    expect(saved.entries.find((entry) => entry.entryId === row.id)?.atBackOffs).toBe(true);
  });

  it('an unreadable mark is dropped, never the exercise', () => {
    const exercise = { exerciseId: ROW, sets: [{ kind: 'working', reps: 5, weight: 180, rir: 2 }] };
    expect(LoggedExerciseSchema.parse({ ...exercise, atBackOffs: true }).atBackOffs).toBe(true);
    const odd = LoggedExerciseSchema.parse({ ...exercise, atBackOffs: 'yes' });
    expect(odd.atBackOffs).toBeUndefined();
    expect(odd.sets).toHaveLength(1);
    const entry = entryOf(plan([pulled()], undefined, { templateId: 'upper' }), ROW);
    expect(WorkoutEntrySchema.parse(entry).atBackOffs).toBe(true);
    const planned = WorkoutEntrySchema.parse({ ...entry, atBackOffs: 1 });
    expect(planned.atBackOffs).toBeUndefined();
    expect(planned.exerciseId).toBe(ROW);
  });

  it('the top set reads past the straight days at the back-offs’ load, wherever they fall', () => {
    const marked = straight(11, 170, true);
    const own = straight(4, 175, false);
    const latest = straight(2, 170, true);
    // Each marked day is passed over, one before the top set's session too (the sixth review: one
    // between two top sets broke the progression's run of misses); the lift's own stays. Since its
    // last top set the lift has had two sessions, its own among them: it is still on the structure
    // (the seventh review counts them all).
    const read = pastBackOffDays(ROW, [marked, pulled(), own, latest], true);
    const rows = (id: string) =>
      read.find((item) => item.id === id)!.entries.filter((entry) => entry.exerciseId === ROW);
    expect(rows(latest.id)).toEqual([]);
    expect(rows(own.id)).toHaveLength(1);
    expect(rows(marked.id)).toEqual([]);
    // With nothing marked, the history as it is.
    const plain = [pulled(), own];
    expect(pastBackOffDays(ROW, plain, true)).toBe(plain);
  });

  it('through two such days running at most: past them, the lift has left the structure', () => {
    const rows = (history: WorkoutRecord[]) =>
      pastBackOffDays(ROW, history, true)
        .flatMap((item) => item.entries)
        .filter((entry) => entry.exerciseId === ROW);
    const upper = (history: WorkoutRecord[]) =>
      entryOf(plan(history, undefined, { templateId: 'upper' }), ROW);
    // One and two such days: read past, back to the top set's own session.
    expect(rows([pulled(), straight(6, 170, true)])).toHaveLength(1);
    const two = [pulled(), straight(6, 170, true), straight(4, 170, true)];
    expect(rows(two)).toHaveLength(1);
    expect(upper(two).atBackOffs).toBe(true);
    // Three: the lift has left the structure, its straight sessions its own, read as they are, on
    // a day it is main as on one it is secondary (the fifth review).
    const three = [...two, straight(2, 170, true)];
    expect(pastBackOffDays(ROW, three, true)).toBe(three);
    expect(upper(three).atBackOffs).toBeUndefined();
    // So do three sessions since the top set with one of its own among them (the seventh review:
    // its own sessions at another range ended each run at one, and it never left).
    const mixed = [
      pulled(),
      straight(6, 170, true),
      straight(4, 175, false),
      straight(2, 170, true),
    ];
    expect(pastBackOffDays(ROW, mixed, true)).toBe(mixed);
    // A straight session of its own ends it.
    expect(upper([pulled(), straight(4, 175, false)]).atBackOffs).toBeUndefined();
    // Whether the lift has run on the structure at all; whether the session its target reads ran
    // so, the target says.
    expect(ranOnTopSet(ROW, [pulled()])).toBe(true);
    expect(ranOnTopSet(ROW, [straight(4, 175, false)])).toBe(false);
  });

  it('a saved copy’s straight sets are the lifter’s own', () => {
    const workout = plan([pulled()], undefined, { templateId: 'upper' });
    expect(entryOf(workout, ROW).atBackOffs).toBe(true);
    const loaded = withDropsToday(
      workout,
      [pulled()],
      (exercise) => loadingFor(gym.loading, { missingPlates: [] }, exercise, 'lb'),
      'lb',
    );
    expect(entryOf(loaded, ROW).atBackOffs).toBeUndefined();
  });
});
