import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { gym, plan, profileOf, run, shape } from '../../test/backOffs';
import { generateWorkout } from '../workoutGenerator/generate';
import { STRENGTH_MAXES_ID, type StrengthMaxes } from '../progression/maxes';

/**
 * The seventh review of round N. The sixth review's HIGH, through a max entered. The row's top set
 * missed its floor two pull days running, the upper day between it (the row secondary there, straight
 * at the back-offs' load, saved as such a day) lifted as asked: today's pull day plan reads past that
 * day (`mainLiftTarget`'s own straight target, the sixth review's fix) and asks the micro-deload,
 * "Missed the floor twice in a row: micro-deload 10%", 150 lb on straight sets. The lifter opens the
 * row's sheet and enters a max ("Enter your max", any lift with a start ratio): the `max` rebuild
 * (`fittedFrom`) takes `mainLiftTarget` only when it gives a drop or a day at the back-offs' load, and
 * otherwise its own target read off the whole history, the upper day between the misses breaking
 * the run: "Missed the floor last time; one session is not a trend, so repeat the load", every set
 * at 165, the load missed twice, at 2 in reserve. The same road on a return after a break, where
 * the lift's card itself offers "Know your max?": the rebuild reads the return off the upper day's
 * straight sets (an estimated max of 221.7 lb), where the plan with that max reads it off the last
 * top set past that day (233.3 lb): 170 lb on the sheet and the saved plan, 175 in a plan built with
 * the same max. The spec: the lift's own straight target reads past its straight days at the
 * back-offs' load wherever they fall; a max entered reads the target as every plan does (the fourth
 * review). Synthetic data only.
 */

const ROW = 'barbell-row';

function structured(
  templateId: string,
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

/** The upper day: the row secondary, straight at its back-offs' load, saved as such a day. */
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
  const entry = done.entries[0]!;
  entry.role = 'secondary-strength';
  entry.atBackOffs = true;
  return done;
}

const backOffsAt = (weight: number): SetSpec[] => [
  [5, weight, 2],
  [5, weight, 2],
  [5, weight, 2],
];

// The top set one rep under its floor of 4, at no reserve, two pull days running.
const history = [
  structured('pull-arms', 11, [3, 165, 0], backOffsAt(155)),
  upperDay(7, 155),
  structured('pull-arms', 4, [3, 165, 0], backOffsAt(155)),
];

const rowIn = (workout: GeneratedWorkout): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === ROW)!;

/** A max that says less than the log: the log stays the evidence, the target should not move. */
const maxOf = (e1rm: number): StrengthMaxes => ({
  id: STRENGTH_MAXES_ID,
  maxes: { [ROW]: { e1rm, units: 'lb', enteredAt: RECORD_NOW, from: null } },
  prompts: {},
});

describe('a max entered on the row’s micro-deload day, the upper day between its misses', () => {
  it('keeps the micro-deload the plan asks', () => {
    const workout = plan(history, undefined, { templateId: 'pull-arms' });
    const before = rowIn(workout);
    expect(before.role).toBe('primary-strength');
    // The plan: the micro-deload on straight sets, read past the upper day (the sixth review's fix).
    expect(before.progression?.mode).toBe('deload');
    expect(shape(before).every(([weight]) => (weight as number) < 165)).toBe(true);
    const entered = run({ type: 'max', exerciseId: ROW }, workout, { history, maxes: maxOf(170) });
    const after = rowIn(entered.workout);
    const line = (after.progression?.evidence ?? []).join(' / ');
    // On e6ed7ed: mode 'maintain', every set at 165 at 2 in reserve, "Missed the floor last time; one
    // session is not a trend, so repeat the load."
    expect(after.progression?.mode, line).toBe('deload');
    expect(shape(after), line).toEqual(shape(before));
  });
});

describe('a max entered on the row back from a break, its last session the upper day', () => {
  it('reads the target as a plan with that max does (the card offers the max on a return)', () => {
    // The row's last top set, then the upper day at its back-offs' load, then 26 days off.
    const away = [structured('pull-arms', 30, [5, 200, 1], backOffsAt(190)), upperDay(26, 190)];
    const workout = plan(away, undefined, { templateId: 'pull-arms' });
    const before = rowIn(workout);
    // Back from a break: straight sets, the card offers "Know your max?".
    expect(before.progression?.mode).toBe('return');
    const maxes = maxOf(250);
    const entered = run({ type: 'max', exerciseId: ROW }, workout, { history: away, maxes });
    const after = rowIn(entered.workout);
    // The plan the same history and max give.
    const fresh = rowIn(
      generateWorkout({
        profile: profileOf(),
        location: gym,
        history: away,
        now: RECORD_NOW,
        duration: 'default',
        constraints: { templateId: 'pull-arms' },
        maxes,
      }),
    );
    const lines = `max: ${(after.progression?.evidence ?? []).join(' / ')}\nplan: ${(fresh.progression?.evidence ?? []).join(' / ')}`;
    // On e6ed7ed the max's rebuild reads the return off the upper day's 190 x 5 at 2 (170 lb); the
    // plan reads it off the top set's 200 x 5, past that day (175 lb).
    expect(shape(after), lines).toEqual(shape(fresh));
  });
});
