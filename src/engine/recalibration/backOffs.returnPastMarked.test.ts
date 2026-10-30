import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../core/state/session';
import { buildCompletion, buildWorkoutRecord } from '../../core/state/workoutRecordBuilder';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { STRENGTH_MAXES_ID, type StrengthMaxes } from '../progression/maxes';
import { emptyCompleted, emptyConstraints } from './recalibrate';
import { allEntries } from '../workout/types';
import { record, RECORD_NOW, type SetSpec } from '../../test/records';
import { generateWorkout } from '../workoutGenerator/generate';
import { BENCH, bench, gym, plan, profileOf, run } from '../../test/backOffs';

/**
 * The fifth review of round N, through the recalibration and the completion: the top set reads
 * past the lift's straight days at the back-offs' load, and a break is measured from them, since
 * the lift had none. Three weeks after its last top set, trained on a straight day eight days
 * before, a main lift is a top set and back-offs however its target is read again: a max entered,
 * a change of the day's settings on a lift kept, and the completion's "Next time" after the
 * straight day. Synthetic data only.
 */

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2, { templateId: 'upper' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

/** The full-body day's bench press, straight at the back-offs' load, every set as asked. */
function fullBody(daysAgo: number, weight: number): WorkoutRecord {
  const done = record(
    daysAgo,
    BENCH,
    [
      [5, weight, 2],
      [5, weight, 2],
      [5, weight, 2],
    ],
    [4, 6],
    2,
    { templateId: 'full-body' },
  );
  done.entries[0]!.role = 'secondary-strength';
  done.entries[0]!.atBackOffs = true;
  return done;
}

const history = () => [
  structured(
    22,
    [5, 200, 1],
    [
      [5, 190, 2],
      [5, 190, 2],
      [5, 190, 2],
    ],
  ),
  fullBody(8, 190),
];
const tiers = (workout: Parameters<typeof bench>[0]) =>
  bench(workout)
    .sets.filter((set) => set.kind === 'working')
    .map((set) => set.tier ?? 'straight');
const upperDay = () => plan(history(), profileOf(), { templateId: 'upper' });

describe('a main day three weeks after its last top set, the lift trained on a straight day between', () => {
  it('the plan: a top set and back-offs', () => {
    expect(tiers(upperDay())[0]).toBe('top');
  });

  it('a max entered keeps the top set and back-offs', () => {
    const maxes: StrengthMaxes = {
      id: STRENGTH_MAXES_ID,
      maxes: { [BENCH]: { e1rm: 240, units: 'lb', enteredAt: RECORD_NOW, from: null } },
      prompts: {},
    };
    const entered = run({ type: 'max', exerciseId: BENCH }, upperDay(), {
      history: history(),
      maxes,
    });
    // On 7f23a26 (the plan's own fixed): straight sets, read as back from a break.
    expect(tiers(entered.workout)[0], entered.summary.headline).toBe('top');
  });

  it('a lift kept through a change of the day’s settings keeps them', () => {
    const workout = upperDay();
    const pinned = run({ type: 'pin', entryId: bench(workout).id, pinned: true }, workout, {
      history: history(),
    });
    const easier = run({ type: 'intensity', direction: 'easier' }, pinned.workout, {
      history: history(),
      constraints: pinned.constraints,
    });
    expect(tiers(easier.workout)[0], easier.summary.headline).toBe('top');
  });
});

describe('the completion’s "Next time" after the straight day, three weeks after the last top set', () => {
  it('reads no break: the back-offs’ load the next plan gives', () => {
    // The last top set 29 days ago; straight days at the back-offs' load 15 days ago and today.
    const before = [
      structured(
        29,
        [5, 200, 1],
        [
          [5, 190, 2],
          [5, 190, 2],
          [5, 190, 2],
        ],
      ),
      fullBody(15, 190),
    ];
    const workout = plan(before, profileOf(), { templateId: 'full-body' });
    const entry = bench(workout);
    expect(entry.atBackOffs).toBe(true);
    const working = entry.sets.filter((set) => set.kind === 'working');
    const session = {
      workout,
      constraints: emptyConstraints(),
      completed: {
        ...emptyCompleted(),
        startedAt: RECORD_NOW,
        sets: working.map((set) => ({
          entryId: entry.id,
          exerciseId: BENCH,
          setIndex: set.index,
          kind: 'working',
          reps: 5,
          weight: set.targetWeight,
          // Ground out: read as its own session, the load would hold.
          rir: 0,
          completedAt: RECORD_NOW,
        })),
      },
    } as unknown as WorkoutSession;
    const saved = buildWorkoutRecord(session, {
      now: RECORD_NOW,
      elapsedSeconds: 1800,
      rating: null,
      endedEarly: false,
    });
    expect(allEntries(workout.blocks).length).toBeGreaterThan(0);
    const summary = buildCompletion(session, saved, profileOf(), before);
    const line = summary.nextTargets.find((text) => text.startsWith('Barbell Bench Press'))!;
    expect(line).toBeDefined();
    expect(line).not.toContain('back from a break');
    // The next full-body day, as the plan builds it: the back-offs' load off the last top set.
    const next = bench(
      generateWorkout({
        profile: profileOf(),
        location: gym,
        history: [...before, saved],
        now: new Date(Date.parse(RECORD_NOW) + 2 * 86_400_000).toISOString(),
        duration: 'default',
        constraints: { templateId: 'full-body' },
      }),
    );
    expect(next.atBackOffs).toBe(true);
    const load = next.sets.find((set) => set.kind === 'working')!.targetWeight;
    expect(line).toContain(`${load} lb`);
    // As the plan reads it: the top set's step, the back-offs' load off it. Read without the break
    // measured from the straight days, the line said "(hold)", off today's sets ground out.
    expect(next.progression?.mode).toBe('weight');
    expect(line).toContain('(load up)');
  });
});
