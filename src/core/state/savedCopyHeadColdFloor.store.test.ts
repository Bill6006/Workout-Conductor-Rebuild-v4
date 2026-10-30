import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { Readiness } from '../../engine/recalibration/types';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fourth adversarial review of Maintenance 33: a workout saved under a head cold keeps the
 * day's floor as a layer, and on another day a change to one lift gives another lift its plan back.
 *
 * Steps: a hybrid lifter starts today's workout and logs the first warm-up of its first lift. They
 * check in with a head cold: the lift under way is held at the floor, its sets a rep fewer at 2 in
 * reserve, each kept as it was (`floored`). They save the workout ("Save today's workout"), and
 * discard it. The next day, well again, they load the copy ("Use") and add a set to its last lift.
 *
 * The rule: the engine's own scope rule (recalibrate.ts): "local: one exercise changes (...).
 * Everything else stays byte-for-byte"; and a saved copy is a plain snapshot (`withoutEase`: "the
 * ease of the day it was saved is no part of it"; `planUnderTheEase`: "A saved workout is a plan for
 * another day, and the ease was today's"), the floor lying "over the plan as a layer, as the hard
 * start's ease does" (the report's third pass).
 *
 * What happens: the copy is saved with the floor's marks on (`planUnderTheEase` gives back only a
 * hard start's or "Lighter"'s record), so the loaded copy shows the first lift at the head cold's
 * floor and carries its record. The set added to the last lift runs `underTheFloor`, and with no
 * illness that day nothing lays the floor again: the first lift changes too, "new target 4-6 reps,
 * RIR 1." in the change's own words, a change the lifter never made to it. Before the third review
 * (9580f26) no record was kept, so the change left the first lift as the copy showed it.
 *
 * The fix (the fourth pass): a saved copy is the plan under the floor as under the ease
 * (`planUnderTheEase`), the floor's record gone with it.
 *
 * Synthetic data only.
 */

const DAY_TWO = '2026-09-03T12:00:00.000Z';
const DAY = 86_400_000;
const LIFTS = ['barbell-bench-press', 'back-squat', 'barbell-row'];
const at = (daysAgo: number) => new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();

const headCold: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness: 'head',
};

const working = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.kind !== 'warmup')
    .map((set) => [set.index, set.kind, set.targetReps, set.targetRir, set.targetWeight]);

describe('a workout saved under a head cold, loaded another day', () => {
  it('changes only the lift the lifter changes', async () => {
    let clock = TEST_NOW;
    const { store } = createTestStore({ now: () => clock });
    await store.hydrate();
    const base = createDefaultProfile(TEST_NOW);
    await store.completeOnboarding(
      {
        ...base,
        bodyweight: 185,
        programStyle: 'hybrid',
        techniques: { ...base.techniques, dropSets: true },
        // Every weekday ticked: today is a day of the plan.
        schedule: {
          ...base.schedule,
          availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          weeklyFrequency: 5,
        },
      },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    // Two clean sessions of the week's lifts: the plan runs its main lift on a top set at 1 in
    // reserve.
    const db = await store.getDatabase();
    for (const daysAgo of [12, 9]) {
      for (const exerciseId of LIFTS) {
        await db.put('workouts', {
          ...record(
            0,
            exerciseId,
            [
              [5, 135, 2],
              [5, 135, 2],
              [5, 135, 2],
            ],
            [4, 6],
            2,
          ),
          id: `w-${exerciseId}-${daysAgo}`,
          startedAt: at(daysAgo),
          completedAt: at(daysAgo),
        });
      }
    }
    await store.hydrate();
    store.startWorkout();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const warmup = first.sets.find((set) => set.kind === 'warmup')!;
    await store.logSet(first.id, warmup.index, {
      weight: warmup.targetWeight,
      reps: warmup.targetReps[0],
      rir: 5,
    });
    await store.recalibrate({ type: 'readiness', readiness: headCold });
    const held = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    // The lift under way is held at the floor: its top set a rep fewer at 2 in reserve, the plan's
    // 1 kept as its record.
    expect(first.sets.some((set) => set.tier === 'top' && set.targetRir === 1)).toBe(true);
    expect(
      held.sets.filter((set) => set.kind === 'working').every((set) => set.targetRir >= 2),
    ).toBe(true);
    expect(held.floored?.map((set) => set.targetRir)).toEqual([1]);
    const saved = await store.saveCurrentWorkout('Push');
    store.discardWorkout();

    clock = DAY_TWO;
    store.refreshSession();
    store.loadSavedWorkout(saved.id);
    const loaded = store.getSnapshot().session!;
    const shown = allEntries(loaded.workout.blocks);
    const kept = shown[0]!;
    const last = shown[shown.length - 1]!;
    const result = await store.recalibrate({ type: 'sets', entryId: last.id, workingDelta: 1 });
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const after = allEntries(result.workout.blocks).find((entry) => entry.id === kept.id)!;
    expect(working(after)).toEqual(working(kept));
    expect(result.changes.map((change) => change.entryId)).toEqual([last.id]);
  });
});
