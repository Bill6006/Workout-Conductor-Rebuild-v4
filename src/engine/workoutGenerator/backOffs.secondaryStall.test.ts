import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from './generate';
import { record, type SetSpec } from '../../test/records';
import { gym, plan, profileOf } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the fourth review of round N): a lift that is the main lift
 * one day and a secondary one another steps its top set up from its last top set: its straight days
 * at the back-offs' load in between are read past, as its back-offs are, never as the session its
 * top set steps from. Synthetic data only.
 */

const ROW = 'barbell-row';

function structured(
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId: 'pull-arms' });
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

const liftIn = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry | undefined =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId);

describe('a lift main on one day and secondary on another, every set lifted as asked, the fourth review of round N', () => {
  /** Every set of every plan logged as asked: the reps one past the floor, at the reserve asked. */
  function loggedAsAsked(workout: GeneratedWorkout, when: string, n: number): WorkoutRecord {
    return {
      id: `sim-${n}`,
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
      entries: allEntries(workout.blocks).map((entry) => ({
        exerciseId: entry.exerciseId,
        entryId: entry.id,
        role: entry.role,
        plannedSets: entry.sets.filter((set) => set.kind === 'working').length,
        ...(entry.backOffDrop !== undefined ? { backOffDrop: entry.backOffDrop } : {}),
        // As the app saves it (`buildWorkoutRecord`).
        ...(entry.atBackOffs ? { atBackOffs: true as const } : {}),
        sets: entry.sets.map((set) => ({
          kind: set.kind,
          reps: Math.min(set.targetReps[1], set.targetReps[0] + 1),
          weight: set.targetWeight,
          rir: set.targetRir,
          completed: true,
          setIndex: set.index,
          targetReps: [set.targetReps[0], set.targetReps[1]] as [number, number],
          targetWeight: set.targetWeight,
          targetRir: set.targetRir,
          loggedAt: when,
          ...(set.tier ? { tier: set.tier } : {}),
        })),
      })),
    };
  }

  /** Four weeks of the plan the app builds each training day, lifted as asked: a lift's top sets. */
  function topSetsOver(
    profile: ReturnType<typeof profileOf>,
    days: number[],
    exerciseId: string,
    known: number,
  ): number[] {
    const start = Date.parse('2026-09-07T12:00:00.000Z');
    const at = (offset: number) => new Date(start + offset * 86_400_000).toISOString();
    const history: WorkoutRecord[] = [
      {
        ...record(0, exerciseId, [
          [5, known, 2],
          [5, known, 2],
          [5, known, 2],
        ]),
        id: 'seed',
        startedAt: at(-3),
        completedAt: at(-3),
      },
    ];
    const tops: number[] = [];
    let n = 0;
    for (let week = 0; week < 4; week += 1) {
      for (const day of days) {
        const when = at(week * 7 + day);
        const workout = generateWorkout({
          profile,
          location: gym,
          history,
          now: when,
          duration: 'default',
        });
        const top = liftIn(workout, exerciseId)?.sets.find((set) => set.tier === 'top');
        if (top?.targetWeight) tops.push(top.targetWeight);
        history.push(loggedAsAsked(workout, when, (n += 1)));
      }
    }
    return tops;
  }

  it('the pull day after the upper day the plan builds, lifted as asked: the top set steps up past the last one', () => {
    // The pull day: a top set of 155 x 5 at 1 in reserve, as asked; back-offs at 145 x 5 at 2.
    const pull = structured(
      7,
      [5, 155, 1],
      [
        [5, 145, 2],
        [5, 145, 2],
        [5, 145, 2],
      ],
    );
    // The upper day the plan builds from it, the row its secondary strength lift, lifted as asked.
    const upperAt = '2026-09-07T12:00:00.000Z';
    const upperDay = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: [pull],
      now: upperAt,
      duration: 'default',
      constraints: { templateId: 'upper' },
    });
    const row = liftIn(upperDay, ROW)!;
    expect(row.role).toBe('secondary-strength');
    // On 5894333: straight at 150 x 4-6 at 2, the back-offs' load.
    expect(row.sets.every((set) => set.tier === undefined)).toBe(true);
    const upper = loggedAsAsked(upperDay, upperAt, 1);
    // The next pull day.
    const next = liftIn(plan([pull, upper], undefined, { templateId: 'pull-arms' }), ROW)!;
    const top = next.sets.find((set) => set.tier === 'top')!;
    // Fails on 5894333: 155 again ("Last: 150 lb x 5, 5, 5 @ RIR 2 ... add 5 lb").
    expect(top.targetWeight).toBeGreaterThan(155);
  });

  it('the default four-day split (push, pull, lower, upper), four weeks: the row’s top set moves up', () => {
    const profile = profileOf('hybrid');
    expect(profile.schedule.weeklyFrequency).toBe(4);
    const tops = topSetsOver(profile, [0, 1, 3, 4], ROW, 150);
    expect(tops.length).toBeGreaterThanOrEqual(3);
    // Fails on 5894333: 160 on every pull day (the row straight at 155 on the upper day between).
    expect(tops, `the row’s top sets: ${tops.join(', ')}`).not.toEqual(tops.map(() => tops[0]));
  });

  it('three days a week (full body, upper, lower), four weeks: the bench press’s top set moves up', () => {
    const profile = profileOf('hybrid', {
      schedule: {
        weeklyFrequency: 3,
        typicalDurationMinutes: 60,
        availableDays: ['mon', 'wed', 'fri'],
      },
    });
    const tops = topSetsOver(profile, [0, 2, 4], 'barbell-bench-press', 185);
    expect(tops.length).toBeGreaterThanOrEqual(3);
    // Fails on 5894333: 195 on every upper day (the bench press straight at 185 on the full-body day).
    expect(tops, `the bench press’s top sets: ${tops.join(', ')}`).not.toEqual(
      tops.map(() => tops[0]),
    );
  });
});
