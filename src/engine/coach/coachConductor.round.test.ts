import { describe, expect, it } from 'vitest';
import { exercisesByMuscle, requireExercise } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { checkExerciseFit, isBlocked } from '../conflicts/conflictEngine';
import { buildConflictContext } from '../conflicts/context';
import { withSwap } from '../planning/lastingSwaps';
import type { PlannedSession } from '../planning/weeklyPlan';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { gatherSignals, type CoachInput, type CoachSignal } from './coachConductor';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function input(history: WorkoutRecord[], overrides: Partial<CoachInput> = {}): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
  });
  const fatigue = interpretFatigue(history, NOW, null);
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
    location: gym,
    ...overrides,
  };
}

/** The same input with the session's time budget moved, so room today is a known quantity. */
function withRoom(base: CoachInput, extraMinutes: number): CoachInput {
  return {
    ...base,
    workout: {
      ...base.workout,
      duration: {
        ...base.workout.duration,
        targetMinutes: base.workout.duration.estimatedMinutes + extraMinutes,
      },
    },
  };
}

const coverage = (signals: CoachSignal[]) =>
  signals.filter((signal) => signal.source === 'weekly coverage');

// Half the week done for a four-day plan: two sessions in the last seven days, bench only.
const halfWeek = [
  record(1, 'barbell-bench-press', [[5, 185, 2]]),
  record(3, 'barbell-bench-press', [[5, 185, 2]]),
];

function gapMuscleOf(signal: CoachSignal): MuscleId {
  const action = signal.action;
  if (!action) throw new Error('coverage signal without an action');
  if (action.kind === 'focus') return action.muscle;
  if (action.kind === 'recalibrate' && action.trigger.type === 'add-exercise') {
    return action.trigger.muscle;
  }
  throw new Error(`unexpected action ${action.kind}`);
}

describe('coverage that acts or stays quiet', () => {
  it('stays quiet early in the week', () => {
    const early = [
      record(9, 'barbell-bench-press', [[5, 185, 2]]),
      record(12, 'barbell-bench-press', [[5, 185, 2]]),
    ];
    expect(coverage(gatherSignals(input(early)))).toEqual([]);
  });

  it('adds two sets of an accessory when today has room, with the grammar right', () => {
    const [signal] = coverage(gatherSignals(withRoom(input(halfWeek), 10)));
    expect(signal).toBeDefined();
    expect(signal!.headline).toMatch(/^.+ (is|are) under target this week$/);
    const name = signal!.headline.replace(/ (is|are) under target this week$/, '');
    expect(signal!.headline.endsWith(' are under target this week')).toBe(name.endsWith('s'));
    expect(signal!.action).toMatchObject({
      kind: 'recalibrate',
      trigger: { type: 'add-exercise', sets: 2 },
    });
    expect(signal!.action?.label).toMatch(/^Add 2 sets of /);
    expect(signal!.why[0]).toMatch(/of \d+ weekly sets so far and nothing for it today\./);
    expect(signal!.why[1]).toMatch(/min of room today: two sets of .+ close most of the gap\./);
  });

  it('never offers an accessory the lifter swapped out for weeks', () => {
    const base = withRoom(input(halfWeek), 10);
    const accessory = (coachInput: CoachInput) => {
      const action = coverage(gatherSignals(coachInput))[0]?.action;
      if (action?.kind !== 'recalibrate' || action.trigger.type !== 'add-exercise') {
        throw new Error('expected an accessory');
      }
      return action.trigger;
    };
    const { exerciseId: out, muscle } = accessory(base);
    // Swapped out for another exercise for the muscle that fits here.
    const context = buildConflictContext(profile, gym);
    const to = exercisesByMuscle(muscle).find(
      (exercise) => exercise.id !== out && !isBlocked(checkExerciseFit(exercise, context)),
    );
    expect(to).toBeDefined();
    const swaps = withSwap([], out, to!.id, NOW);
    expect(accessory({ ...base, swaps }).exerciseId).not.toBe(out);
  });

  it('measures the room against the clock: minutes already used are not room', () => {
    // Ten spare minutes on paper. Before the workout starts they are there to offer...
    const base = withRoom(input(halfWeek), 10);
    const [fresh] = coverage(gatherSignals(base));
    expect(fresh?.why[1]).toMatch(/^About 10 min of room today/);
    // ...and a workout running eight minutes behind its plan has used most of them. Logged
    // sets alone must never make the room grow.
    const first = allEntries(base.workout.blocks)[0]!;
    const active: CoachInput = {
      ...base,
      status: 'active',
      completed: {
        ...emptyCompleted(),
        startedAt: NOW,
        sets: first.sets.map((set) => ({
          entryId: first.id,
          exerciseId: first.exerciseId,
          setIndex: set.index,
          kind: set.kind,
          reps: 5,
          weight: 185,
          rir: 2,
          skipped: false,
          completedAt: NOW,
        })),
      },
    };
    const withoutClock = coverage(gatherSignals(active))[0];
    const onPace = coverage(gatherSignals({ ...active, elapsedSeconds: 14 * 60 }))[0];
    const behind = coverage(gatherSignals({ ...active, elapsedSeconds: 30 * 60 }))[0];
    expect(onPace?.action?.kind).toBe('recalibrate');
    expect(behind?.action).toMatchObject({ kind: 'focus' });
    const room = (signal: CoachSignal | undefined) =>
      Number(/^About (\d+) min of room/.exec(signal?.why[1] ?? '')?.[1]);
    expect(room(onPace)).toBeLessThan(room(withoutClock));
  });

  it('sets a focus for the next session when today has no room', () => {
    const [signal] = coverage(gatherSignals(withRoom(input(halfWeek), -5)));
    expect(signal?.action).toMatchObject({ kind: 'focus' });
    expect(signal?.action?.label).toMatch(/^Lead the next session with /);
    expect(signal?.why[1]).toMatch(/^No room today and no session left this week reaches /);
  });

  it('stays quiet when a session still to come reaches the muscle, or the focus is already set', () => {
    const [signal] = coverage(gatherSignals(withRoom(input(halfWeek), 10)));
    const muscle = gapMuscleOf(signal!);
    const reaches: PlannedSession = {
      date: NOW,
      weekday: 'fri',
      label: 'Fri',
      templateId: 'pull-arms',
      title: 'Pull + arms',
      focus: [muscle],
      muscles: [muscle],
      today: false,
    };
    expect(coverage(gatherSignals(input(halfWeek, { upcoming: [reaches] })))).toEqual([]);
    expect(coverage(gatherSignals(input(halfWeek, { focus: muscle })))).toEqual([]);
    // Today's own session in the plan does not count as a session still to come.
    expect(
      coverage(
        gatherSignals(withRoom(input(halfWeek, { upcoming: [{ ...reaches, today: true }] }), 10)),
      ),
    ).toHaveLength(1);
  });
});

describe('every card ends in a tap or a must-know', () => {
  it('offers a swap on a profile pain-area watch', () => {
    const base = input([]);
    const joint = allEntries(base.workout.blocks).flatMap((entry) =>
      Object.entries(requireExercise(entry.exerciseId).jointStress)
        .filter(([, level]) => level === 'moderate')
        .map(([name]) => name as Joint),
    )[0];
    if (!joint) return;
    const watch = gatherSignals(
      input([], {
        profile: { ...profile, limitations: { ...profile.limitations, painAreas: [joint] } },
      }),
    ).find((signal) => signal.source === 'profile limitations');
    expect(watch?.action).toMatchObject({ kind: 'alternatives' });
    expect(watch?.action?.label).toMatch(/^Swap /);
  });

  it('turns an extra-set offer into a tap and keeps a lowered load as a must-know', () => {
    const base = input([]);
    const entry = allEntries(base.workout.blocks)[0]!;
    entry.progression = {
      mode: 'reps',
      evidence: ['Two sessions at the top of the range: an extra set is on the table.'],
      sessions: 2,
      viaFamily: false,
      confidence: 'medium',
      setsAdvice: 1,
    };
    const offer = gatherSignals(base).find((signal) => signal.source === 'extra set');
    expect(offer?.headline).toMatch(/an extra set is on the table$/);
    expect(offer?.action).toMatchObject({
      kind: 'recalibrate',
      trigger: { type: 'sets', entryId: entry.id, workingDelta: 1 },
      label: 'Add the set',
    });

    entry.progression = { ...entry.progression, mode: 'deload', setsAdvice: 0 };
    const lowered = gatherSignals(base).find((signal) => signal.source === 'progression');
    expect(lowered?.headline).toMatch(/micro-deload/);
    expect(lowered?.action).toBeNull();
  });

  it('carries no logging tip and no superset readout as signals any more', () => {
    const noWeights = [record(1, 'push-up', [[12, null, 2]])];
    const sources = gatherSignals(input(noWeights, { workoutCount: 1 })).map(
      (signal) => signal.source,
    );
    expect(sources).not.toContain('logging habit');
    expect(sources).not.toContain('superset evidence');
  });
});
