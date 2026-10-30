import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { SESSION_KEY } from './session';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { WorkoutEntrySchema } from '../../engine/workout/workoutSchema';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. The eleventh pass stores a new field on the plan's entry,
 * `backOffAt` (kept in the session, the undo's copy and a saved copy), with no line in the stored
 * entry's schema (`WorkoutEntrySchema`, a loose object), so a value this copy cannot read is never
 * dropped: it is carried into the finished workout's record, written to the database as it is, and
 * read by the completion's feedback, which then passes over every back-off.
 *
 * The rules: CLAUDE.md, "a new stored field is optional, with `.catch(...)`"; the report (docs/
 * reports/maintenance-32.md), "each optional and dropped alone when an older or damaged copy cannot
 * read it, never the set, the exercise or the plan around it", and the ninth pass, "Both new stored
 * values are optional and dropped alone when unreadable" (the plan's `backOffDrop`, `atBackOffs` and
 * `manual.backOffs` each have their line).
 *
 * Steps: the main lift planned at 160 × 4-6 at 1, back-offs 150. The top set lifted as planned,
 * every back-off 150 × 5 at 0, two reps harder than asked. The stored session's entry carries a
 * `backOffAt` this copy cannot read (-1); the app opened again and the workout finished.
 *
 * What happens on f858500: the schema keeps -1; the record is written with `backOffAt` -1, and the
 * feedback says nothing of the back-offs' miss ("Barbell Row: progressed, 155 × 5 became 160 lb ×
 * 5."). d119260 has no such field: there the test fails only at the schema's line (the loose
 * schema keeps any unknown field), the record and the feedback right. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function startedMain() {
  const handle = createTestStore({ now: () => TEST_NOW });
  const { store } = handle;
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  for (const daysAgo of [7, 3]) {
    for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
      await db.put('workouts', {
        ...record(0, exerciseId, [
          [5, 155, 2],
          [5, 155, 2],
          [5, 155, 2],
        ]),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await store.hydrate();
  const main = (): WorkoutEntry =>
    allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.backOffDrop !== undefined,
    )!;
  expect(main()).toBeDefined();
  store.startWorkout();
  return { ...handle, main };
}

describe('the plan entry’s backOffAt, stored', () => {
  it('is dropped alone when this copy cannot read it', async () => {
    const { store, storage, factory, main } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(160);
    await store.logSet(main().id, top.index, { weight: 160, reps: 5, rir: 1 });
    for (const set of main().sets.filter((each) => each.tier === 'back-off')) {
      await store.logSet(main().id, set.index, { weight: 150, reps: 5, rir: 0 });
    }
    const id = main().id;
    const name = main().exerciseId;
    const parsed = WorkoutEntrySchema.parse({ ...main(), backOffAt: -1 });
    // The stored session with a value this copy cannot read; the app opened again.
    const stored = JSON.parse(storage.getItem(SESSION_KEY)!) as {
      workout: { blocks: { entries: Record<string, unknown>[] }[] };
    };
    for (const block of stored.workout.blocks) {
      for (const entry of block.entries) if (entry.id === id) entry.backOffAt = -1;
    }
    storage.setItem(SESSION_KEY, JSON.stringify(stored));
    const again = createTestStore({ now: () => TEST_NOW, factory, storage });
    await again.store.hydrate();
    const summary = await again.store.finishWorkout(null);
    const db = await again.store.getDatabase();
    const written = (await db.get<{
      id: string;
      entries: { exerciseId: string; backOffAt?: unknown }[];
    }>('workouts', summary.recordId))!;
    const line = summary.feedback.find((each) => each.includes('160 lb')) ?? '';
    // On f858500: -1 kept by the schema and written; no word on the back-offs.
    expect({
      parsed: parsed.backOffAt,
      written: written.entries.find((entry) => entry.exerciseId === name)?.backOffAt,
      line,
    }).toEqual({
      parsed: undefined,
      written: 150,
      line: expect.stringContaining('the back-offs ran a rep or more harder than asked'),
    });
  });
});
