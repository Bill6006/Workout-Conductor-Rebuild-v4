import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { allEntries } from '../workout/types';
import { requireExercise } from '../../catalog/exercises/catalog';
import { generateWorkout } from './generate';

/**
 * Maintenance 27, the owner's item 46, and its review: the split follows the number of days. From
 * four, the four-template rotation; at three or fewer, full body, upper and lower rotate as before
 * item 46 (full body alone at two days left calves, abs, side delts and upper chest untrained).
 */

const DAY = 86_400_000;
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const base = createDefaultProfile(RECORD_NOW);

function onDays(days: Weekday[], extra: Partial<UserProfile> = {}): UserProfile {
  return {
    ...base,
    schedule: { ...base.schedule, weeklyFrequency: days.length, availableDays: days },
    ...extra,
  };
}

/** Six sessions three or four days apart, each done as planned; the templates they took. */
function templates(profile: UserProfile): string[] {
  const history: WorkoutRecord[] = [];
  const out: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const now = new Date(Date.parse(RECORD_NOW) + Math.round(index * 3.5) * DAY).toISOString();
    const workout = generateWorkout({ profile, location: gym, history, now, duration: 'default' });
    out.push(workout.templateId);
    history.push({
      id: `w-${index}`,
      startedAt: now,
      completedAt: now,
      locationId: 'gym',
      templateId: workout.templateId,
      endedEarly: false,
      rating: null,
      skippedExerciseIds: [],
      painJoints: [],
      readiness: null,
      prs: [],
      entries: allEntries(workout.blocks).map((entry) => ({
        exerciseId: entry.exerciseId,
        sets: entry.sets
          .filter((set) => set.kind === 'working')
          .map((set) => ({
            kind: 'working' as const,
            reps: set.targetReps[0],
            weight: set.targetWeight ?? 50,
            rir: set.targetRir,
            completed: true,
          })),
      })),
    });
  }
  return out;
}

describe('the split by the number of days', () => {
  it('rotates full body, upper and lower at two days a week, and at one', () => {
    const three = new Set(['full-body', 'upper', 'lower']);
    expect(new Set(templates(onDays(['mon', 'thu'])))).toEqual(three);
    expect(
      new Set(templates(onDays(['mon', 'thu'], { goals: { ...base.goals, primary: 'strength' } }))),
    ).toEqual(three);
    const once = templates({
      ...onDays(['mon']),
      schedule: { ...base.schedule, weeklyFrequency: 1, availableDays: ['mon'] },
    });
    expect(once.every((id) => three.has(id))).toBe(true);
  });

  it('trains the calves, the abs and the side delts at two days a week', () => {
    // Full body alone left them untrained (the review of item 46).
    const history: string[] = [];
    const profile = onDays(['mon', 'thu']);
    let records: WorkoutRecord[] = [];
    for (let index = 0; index < 8; index += 1) {
      const now = new Date(Date.parse(RECORD_NOW) + Math.round(index * 3.5) * DAY).toISOString();
      const workout = generateWorkout({
        profile,
        location: gym,
        history: records,
        now,
        duration: 'default',
      });
      history.push(...allEntries(workout.blocks).map((entry) => entry.exerciseId));
      records = [
        ...records,
        {
          id: `w-${index}`,
          startedAt: now,
          completedAt: now,
          locationId: 'gym',
          templateId: workout.templateId,
          endedEarly: false,
          rating: null,
          skippedExerciseIds: [],
          painJoints: [],
          readiness: null,
          prs: [],
          entries: allEntries(workout.blocks).map((entry) => ({
            exerciseId: entry.exerciseId,
            sets: [{ kind: 'working' as const, reps: 10, weight: 50, rir: 2, completed: true }],
          })),
        },
      ];
    }
    const trained = new Set(
      history.flatMap((id) => requireExercise(id).primaryMuscles as readonly string[]),
    );
    for (const muscle of ['calves', 'abs', 'side-delts']) expect(trained, muscle).toContain(muscle);
  });

  it('keeps full body, upper and lower for a new lifter at four days too', () => {
    const four = templates(onDays(['mon', 'tue', 'thu', 'fri'], { programStyle: 'foundation' }));
    expect(four.every((id) => ['full-body', 'upper', 'lower'].includes(id))).toBe(true);
    // Not so a lifter past Foundation: four days rotate the four templates.
    expect(templates(onDays(['mon', 'tue', 'thu', 'fri'])).some((id) => id === 'push-arms')).toBe(
      true,
    );
  });

  it('rotates full body, upper and lower at three, and for a new lifter at two', () => {
    expect(new Set(templates(onDays(['mon', 'wed', 'fri'])))).toEqual(
      new Set(['full-body', 'upper', 'lower']),
    );
    expect(new Set(templates(onDays(['mon', 'thu'], { programStyle: 'foundation' })))).toEqual(
      new Set(['full-body', 'upper', 'lower']),
    );
  });
});
