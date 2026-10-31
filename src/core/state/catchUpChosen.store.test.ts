import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { restCategory } from '../../engine/progression/roles';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The owner, 2026-10-31: "the user does NOT choose between 'Catch-up' and 'Full session.' Workout
 * Conductor is supposed to make the programming decision." Each kind of day gets the one workout the
 * app chose from the week, the recovery, the place and the length picked, with no tap of kind: a
 * day not ticked its catch-up, what is furthest behind first; a length picked keeps what is behind;
 * a day ticked its own session; a day trained a second workout that leads with what was missed and
 * sits out what was trained. TEST_NOW is a Wednesday, which the default schedule does not tick.
 * Synthetic data only.
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

async function lifter(
  history: { daysAgo: number; exerciseId: string }[],
  changes: Partial<UserProfile> = {},
) {
  const handle = createTestStore({ now: () => TEST_NOW });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...changes },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  for (const { daysAgo, exerciseId } of history) {
    const when = daysBefore(daysAgo);
    await db.put('workouts', {
      ...record(
        0,
        exerciseId,
        [
          [10, 100, 2],
          [10, 100, 2],
          [10, 100, 2],
        ],
        [8, 12],
        2,
      ),
      id: `w-${exerciseId}-${daysAgo}`,
      startedAt: when,
      completedAt: when,
    });
  }
  await handle.store.hydrate();
  return handle;
}
type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const direct = (exerciseId: string) => requireExercise(exerciseId).primaryMuscles;

const schedule = createDefaultProfile(TEST_NOW).schedule;
const wednesdayTicked: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: [...schedule.availableDays, 'wed'], weeklyFrequency: 5 },
};

describe('the one workout the app chooses for the day', () => {
  it('on a day not ticked: the catch-up, what is furthest behind first, no tap of kind', async () => {
    // Yesterday's bench press: the chest and the triceps inside their 48 hours.
    const handle = await lifter([
      { daysAgo: 2, exerciseId: 'back-squat' },
      { daysAgo: 1, exerciseId: 'barbell-bench-press' },
    ]);
    const today = session(handle);
    expect(today.status).toBe('preview');
    expect(today.workout.templateId).toBe('catch-up');
    expect(today.constraints.fullSession).toBeUndefined();
    const spec = today.constraints.catchUp!;
    expect(spec.kind).toBe('catch-up');
    expect(spec.muscles.length).toBeGreaterThan(1);
    // The muscle furthest behind leads the offer (largest share short first, catchUp.test.ts), and
    // the plan's lifts follow that order, its strength lifts first: each lift's first muscle behind
    // comes no earlier in the offer than the one before it.
    const behind = spec.muscles.map((item) => item.muscle);
    const entries = allEntries(today.workout.blocks);
    const rank = (exerciseId: string) =>
      Math.min(
        ...direct(exerciseId)
          .map((muscle) => behind.indexOf(muscle))
          .filter((at) => at >= 0),
      );
    for (const strength of [true, false]) {
      const ranks = entries
        .filter((entry) => (restCategory(entry.role) === 'strength') === strength)
        .map((entry) => rank(entry.exerciseId));
      expect(ranks, `${strength ? 'strength' : 'other'} lifts`).toEqual(
        [...ranks].sort((a, b) => a - b),
      );
    }
    expect(entries.some((entry) => direct(entry.exerciseId).includes(behind[0]!))).toBe(true);
    // Every lift goes in for what is behind, none for the chest or the triceps the bench press
    // worked inside their 48 hours.
    for (const entry of entries) {
      expect(
        direct(entry.exerciseId).some((muscle) => behind.includes(muscle)),
        entry.exerciseId,
      ).toBe(true);
      for (const resting of ['chest', 'triceps'] as MuscleId[]) {
        expect(direct(entry.exerciseId), entry.exerciseId).not.toContain(resting);
      }
    }
    // No set to failure on a day off the plan.
    for (const set of entries.flatMap((entry) => entry.sets)) {
      if (set.kind === 'working') expect(set.targetRir).toBeGreaterThanOrEqual(1);
    }
    // Today says what the plan is; nothing on it asks.
    expect(dayNoteOf(today, false)).toEqual({
      text: `Not one of your training days: a ${today.workout.duration.estimatedMinutes}-minute catch-up for what is behind this week.`,
    });
  });

  it('on a day not ticked at 30 min: still the catch-up, what is furthest behind kept', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    const first = session(handle).constraints.catchUp!.muscles[0]!.muscle;
    expect((await handle.store.setDurationChoice(30))?.ok).toBe(true);
    const today = session(handle);
    expect(today.workout.templateId).toBe('catch-up');
    expect(today.constraints.fullSession).toBeUndefined();
    expect(today.workout.duration.estimatedMinutes).toBeLessThanOrEqual(31);
    expect(
      allEntries(today.workout.blocks).some((entry) => direct(entry.exerciseId).includes(first)),
      first,
    ).toBe(true);
  });

  it('on a day ticked: the day’s own session, with nothing to choose', async () => {
    const handle = await lifter(
      [{ daysAgo: 2, exerciseId: 'barbell-bench-press' }],
      wednesdayTicked,
    );
    const today = session(handle);
    expect(today.workout.templateId).not.toBe('catch-up');
    expect(today.constraints.catchUp ?? null).toBeNull();
    expect(dayNoteOf(today, true)).toBeNull();
  });

  it('on a day trained: a second workout that leads with what was missed, the trained sitting out', async () => {
    const handle = await lifter(
      [{ daysAgo: 0, exerciseId: 'barbell-bench-press' }],
      wednesdayTicked,
    );
    const today = session(handle);
    const spec = today.constraints.catchUp!;
    expect(spec.kind).toBe('second');
    expect(today.constraints.fullSession).toBeUndefined();
    // The bench press done this morning is not in it again; the chest it trained takes at most what
    // is left of one session; and a lift for what was missed comes first.
    const entries = allEntries(today.workout.blocks);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.exerciseId)).not.toContain('barbell-bench-press');
    const chestLeft = spec.muscles.find((item) => item.muscle === 'chest')?.sets ?? 0;
    const chestSets = entries
      .filter((entry) => direct(entry.exerciseId).includes('chest'))
      .reduce((sum, entry) => sum + entry.sets.filter((set) => set.kind === 'working').length, 0);
    expect(chestSets).toBeLessThanOrEqual(chestLeft);
    const missed = spec.muscles.filter((item) => item.why === 'behind').map((item) => item.muscle);
    expect(missed.length).toBeGreaterThan(0);
    expect(direct(entries[0]!.exerciseId).some((muscle) => missed.includes(muscle))).toBe(true);
    expect(dayNoteOf(today, true)?.text).toMatch(/^You trained today/);
  });
});
