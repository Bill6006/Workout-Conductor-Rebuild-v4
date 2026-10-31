import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { cutRunning, generateWorkout } from './generate';
import { plannedRecord } from '../planning/weekModel';
import { syntheticRecord } from '../planning/weeklyPlan';

/**
 * Maintenance 34, what keeps getting cut (the approved proposal: "Store what the time fit left out
 * of each workout. A muscle cut last time is protected next time. If a muscle is cut twice running,
 * trim a set from an already well-covered muscle instead ... Rotate which isolation move goes, so no
 * muscle loses every short day"). The default lifter at the gym, 15 minutes, or at home on a full-body
 * day of 30. A muscle is cut where the fit left out a lift that works it directly. Synthetic data only.
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
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
    expect(cutRunning([done(short, 3)], NOW, short.templateId).get(cut)).toBe(1);
    expect(cutRunning([done(short, 3), done(short, 5)], NOW, short.templateId).get(cut)).toBe(2);
    // A session between with the muscle not cut ends the run.
    expect(
      cutRunning([done(short, 3, false), done(short, 5)], NOW, short.templateId).get(cut),
    ).toBeUndefined();
    // A session from before the record kept it cut nothing.
    expect(cutRunning([done(short, 3, false)], NOW, short.templateId).size).toBe(0);
  });

  it('names the muscles of the lifts it left out, never one only trimmed', () => {
    // At 15 minutes the push day's bench press and incline press stay, trimmed; the rest go.
    const short = plan([]);
    expect(allEntries(short.blocks).map((entry) => entry.exerciseId)).toEqual([
      'barbell-bench-press',
      'incline-dumbbell-press',
    ]);
    // The upper chest only lost a set of its incline press; the chest lost its cable fly, the side
    // delts their lateral raise.
    expect(short.fitCut).not.toContain('upper-chest');
    expect(short.fitCut).toEqual(expect.arrayContaining(['chest', 'side-delts']));
  });

  it('is kept on each day the week model and the week ahead plan, as on a workout saved', () => {
    const short = plan([]);
    expect(short.fitCut?.length ?? 0).toBeGreaterThan(0);
    expect(plannedRecord(NOW, short).fitCut).toEqual(short.fitCut);
    expect(syntheticRecord(NOW, short).fitCut).toEqual(short.fitCut);
  });

  it('reads the same day of the split: a pull day between two push days ends no run', () => {
    const short = plan([]);
    const cut = short.fitCut![0]!;
    const pull = { ...done(short, 4), id: 'w-pull', templateId: 'pull-arms' };
    expect(short.templateId).toBe('push-arms');
    expect(cutRunning([done(short, 3), pull, done(short, 5)], NOW, 'push-arms').get(cut)).toBe(2);
    // The pull day itself reads only its own.
    expect(cutRunning([done(short, 3), pull, done(short, 5)], NOW, 'pull-arms').get(cut)).toBe(1);
  });

  it('reads only sessions with work in them', () => {
    const short = plan([]);
    const cut = short.fitCut![0]!;
    // The newest, a session with nothing logged that kept the cut: it says nothing.
    const empty: WorkoutRecord = { ...done(short, 1), id: 'w-empty', entries: [] };
    expect(
      cutRunning([empty, done(short, 3, false)], NOW, short.templateId).get(cut),
    ).toBeUndefined();
    expect(cutRunning([empty, done(short, 3)], NOW, short.templateId).get(cut)).toBe(1);
  });

  it('is spared next time: a lift for a muscle cut last time stays where another goes instead', () => {
    // At home, a full-body day of 30 minutes leaves out the Romanian deadlift and the arms' moves:
    // the hamstrings, glutes, biceps and triceps are cut.
    const atHome = (history: readonly WorkoutRecord[]) =>
      generateWorkout({
        profile,
        location: home,
        history,
        now: NOW,
        duration: 30,
        constraints: { templateId: 'full-body' },
      });
    const first = atHome([]);
    expect(first.fitCut).toEqual(['biceps', 'triceps', 'hamstrings', 'glutes']);
    const lifts = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks).map((entry) => entry.exerciseId);
    // The cut kept: the shoulder press, for the triceps, stays, and the row goes instead.
    const spared = atHome([done(first, 2)]);
    expect(lifts(spared)).toContain('dumbbell-shoulder-press');
    expect(lifts(spared)).not.toContain('chest-supported-row');
    // Without it, the row stays and the shoulder press, the triceps' lift, goes again.
    const unspared = atHome([done(first, 2, false)]);
    expect(lifts(unspared)).toContain('chest-supported-row');
    expect(lifts(unspared)).not.toContain('dumbbell-shoulder-press');
  });
});
