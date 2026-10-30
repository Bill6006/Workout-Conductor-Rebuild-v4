import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../planning/catchUp';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from '../recalibration/types';
import { allEntries, isStopped, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from './generate';
import {
  at,
  describeWorkout,
  gym as gymOrNone,
  profileOf,
  session,
  working,
} from '../../test/clockDays';

/**
 * Fifteenth review of round M. The fourteenth pass made one rule (`keptAsPicked`) say what stays
 * through a rebuild as the lifter's pick does, what came in for comfort or pain among it, "and every
 * rebuild read it". The generator's `reopened`, which picks a lift stopped at another place up again
 * where it fits once more, still reads only `locked || pinned`: a lift the lifter swapped in stops
 * it, one that came in for comfort gives way. In a catch-up for the quads and the glutes at the gym:
 * a set of the back squat, then the lifter goes home, where the squat stops and the goblet squat
 * stands in; "Uncomfortable" on it brings the Bulgarian split squat. Back at the gym, the Bulgarian
 * split squat is gone and the back squat takes its sets again; the same Bulgarian split squat swapped
 * in by the lifter stays. The rules: what comes in stays through every rebuild, as the lifter's pick
 * does. Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const gym = gymOrNone as LocationProfile;
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['quads', 'glutes'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};

function gymHomeGym(change: 'uncomfortable' | 'replace' | 'pain', planDay = false) {
  let workout: GeneratedWorkout = generateWorkout({
    profile: profileOf(),
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: planDay ? { templateId: 'lower' } : { catchUp: spec },
  });
  let constraints: SessionConstraints = planDay
    ? emptyConstraints()
    : { ...emptyConstraints(), catchUp: spec };
  let location: LocationProfile = gym;
  const steps: string[] = [describeWorkout(workout).join('; ')];
  const squat = allEntries(workout.blocks)[0]!;
  expect(squat.exerciseId, steps[0]).toBe('back-squat');
  const first = working(squat)[0]!;
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 300,
    sets: [
      {
        entryId: squat.id,
        exerciseId: squat.exerciseId,
        setIndex: first.index,
        kind: 'working',
        reps: 8,
        weight: first.targetWeight,
        rir: 2,
        completedAt: at(9, 18, 5),
      },
    ],
  };
  const run = (trigger: RecalibrationTrigger): RecalibrationSuccess => {
    const result = recalibrate({
      trigger,
      workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location,
      loading: { missingPlates: [] },
      history: records,
      constraints,
      reason: 'test',
      timestamp: at(9, 18, 10),
    });
    if (!result.ok) throw new Error(`${result.error} (${steps.join(' | ')})`);
    workout = result.workout;
    constraints = result.constraints;
    steps.push(
      `${trigger.type}: ${result.summary.headline} ${describeWorkout(workout).join('; ')}`,
    );
    return result;
  };
  // Home: the squat stops at its set, the goblet squat stands in for the two it owes.
  location = home;
  run({ type: 'location' });
  const standIn = allEntries(workout.blocks).find(
    (entry) => !isStopped(entry) && entry.slot === squat.slot,
  )!;
  expect(standIn?.exerciseId, steps.join(' | ')).toBe('goblet-squat');
  // What comes in for it: for comfort, for a sore wrist (the dumbbell held), or the lifter's own swap
  // to the same lift.
  run(
    change === 'uncomfortable'
      ? { type: 'uncomfortable', entryId: standIn.id }
      : change === 'pain'
        ? { type: 'pain', entryId: standIn.id, joint: 'wrist' }
        : { type: 'replace', entryId: standIn.id, exerciseId: 'bulgarian-split-squat' },
  );
  const cameIn = allEntries(workout.blocks).find(
    (entry) => !isStopped(entry) && entry.slot === squat.slot,
  );
  expect(cameIn, steps.join(' | ')).toBeDefined();
  if (change !== 'pain' && !planDay) {
    expect(cameIn?.exerciseId, steps.join(' | ')).toBe('bulgarian-split-squat');
  }
  // Back at the gym.
  location = gym;
  run({ type: 'location' });
  const stays = allEntries(workout.blocks).some(
    (entry) => entry.exerciseId === cameIn?.exerciseId && !isStopped(entry),
  );
  return { stays, steps };
}

describe('what came in for comfort stays when the lift it followed fits again', () => {
  it('the lifter’s own swap to the Bulgarian split squat stays back at the gym', () => {
    const { stays, steps } = gymHomeGym('replace');
    expect(stays, steps.join(' | ')).toBe(true);
  });

  it('the Bulgarian split squat in for comfort stays back at the gym, as the lifter’s pick does', () => {
    const { stays, steps } = gymHomeGym('uncomfortable');
    // On 3290cd8: "Rebuilt for Gym: 1 exercise replaced.", "back-squat x3 @RIR 2/2/2".
    expect(stays, steps.join(' | ')).toBe(true);
  });

  it('what came in for a sore wrist stays back at the gym, where the squat spares it', () => {
    const { stays, steps } = gymHomeGym('pain');
    expect(stays, steps.join(' | ')).toBe(true);
  });

  it('on a day of the plan, the lift it followed takes it back where it fits again, as before', () => {
    const { stays, steps } = gymHomeGym('uncomfortable', true);
    expect(stays, steps.join(' | ')).toBe(false);
  });
});
