import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { cutRunning, generateWorkout } from './generate';

/**
 * Maintenance 34, what keeps getting cut (the approved proposal: "Store what the time fit left out
 * of each workout. A muscle cut last time is protected next time. If a muscle is cut twice running,
 * trim a set from an already well-covered muscle instead ... Rotate which isolation move goes, so no
 * muscle loses every short day"). The default lifter at the gym, 15 minutes. Synthetic data only.
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const daysBefore = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

const plan = (history: readonly WorkoutRecord[], now = NOW) =>
  generateWorkout({ profile, location: gym, history, now, duration: 15 });

/** A plan done as planned, `days` before now, with what its fit cut kept or not. */
function done(workout: GeneratedWorkout, days: number, keepCut = true): WorkoutRecord {
  const when = daysBefore(days);
  return {
    id: `w-${days}-${keepCut}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: workout.templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    ...(keepCut && workout.fitCut ? { fitCut: [...workout.fitCut] } : {}),
    entries: allEntries(workout.blocks).map((entry) => ({
      exerciseId: entry.exerciseId,
      sets: entry.sets
        .filter((set) => set.kind === 'working')
        .map((set) => ({
          kind: 'working' as const,
          reps: set.targetReps[1],
          weight: set.targetWeight,
          rir: 2,
          completed: true,
        })),
    })),
  };
}

/** The muscles a plan's lifts work directly. */
const worked = (workout: GeneratedWorkout) =>
  new Set<MuscleId>(
    allEntries(workout.blocks).flatMap((entry) => requireExercise(entry.exerciseId).primaryMuscles),
  );

describe('what the time fit cut', () => {
  it('is kept on the plan: the muscles it left fewer direct sets than the plan gave', () => {
    const short = plan([]);
    expect(short.fitCut?.length ?? 0).toBeGreaterThan(0);
    const full = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    expect(full.fitCut).toBeUndefined();
  });

  it('reads as cut once, then twice running, from the latest sessions', () => {
    const short = plan([]);
    const cut = short.fitCut![0]!;
    expect(cutRunning([done(short, 3)], NOW).get(cut)).toBe(1);
    expect(cutRunning([done(short, 3), done(short, 5)], NOW).get(cut)).toBe(2);
    // A session between with the muscle not cut ends the run.
    expect(cutRunning([done(short, 3, false), done(short, 5)], NOW).get(cut)).toBeUndefined();
    // A session from before the record kept it cut nothing.
    expect(cutRunning([done(short, 3, false)], NOW).size).toBe(0);
  });

  it('is spared next time: a muscle cut last time keeps its lift where another goes instead', () => {
    const first = plan([]);
    const cut = new Set(first.fitCut);
    const spared = plan([done(first, 2)]);
    const unspared = plan([done(first, 2, false)]);
    const kept = (workout: GeneratedWorkout) => [...worked(workout)].filter((one) => cut.has(one));
    expect(kept(spared).length).toBeGreaterThanOrEqual(kept(unspared).length);
    expect(kept(spared).length).toBeGreaterThan(0);
  });
});
