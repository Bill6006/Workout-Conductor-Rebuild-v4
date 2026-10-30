import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-fourth review of round M, from before the round (a saved workout loaded meeting a deload
 * week, older than item 12): `loadSavedWorkout` makes the session with `createSession`, whose
 * constraints are `emptyConstraints()`, and puts back only the day's offer and choices; the deload
 * week covering today (`deload`) and the coach focus (`focus`), which `ensureSession` gives every
 * plan of the day and `rebuildPreview` passes on, are left out.
 *
 * The rules: Maintenance 23, "A deload week was lost when the weights changed or a max was entered;
 * every rebuild keeps it"; Maintenance 24, the deload week's "lighter loads and extra rep in
 * reserve"; `loadSavedWorkout`, "everything after that recalibrates as usual"; and round M's own
 * "Nor in a deload week: the deload's lighter week stands".
 *
 * What happens: in a deload week, the day's own plan (the pull day) is the deload's, the row at three
 * sets and three in reserve; built again for 30 minutes, three sets at three; made harder, four at
 * two. A pull day saved before the week and loaded in it has no deload (`deload: null`), and every
 * rebuild then plans a week with none: 30 minutes gives the row three sets at two in reserve and the
 * chin-up two at one, as a plain week's 30 minutes does; "Make it harder", five sets of the row at
 * one and none in reserve on the rest (four, and none, after a 30 minutes picked first). The coach focus is lost the same way: a pull day loaded with the triceps the coach focus,
 * built again for 45 minutes, no longer says "Triceps lead today: your coach focus." (not tested
 * here: a product choice).
 * Also fails on 6af588c and on 03a1bef (Maintenance 30, the last live build before the round).
 *
 * The fix (the twenty-fourth pass): a loaded workout keeps the deload week that covers today, as
 * every plan of the day does (`deloadToday`), so every change plans it as the week does. The copy
 * itself stands as it was saved until its first change, as its targets do (read the day it was
 * saved): a known limit.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Thursday, a day the schedule ticks
 * (the pull day), at the gym, the lifter saves today's workout as "Pull day", then plans the deload
 * week the coach recommends, covering this week, and loads "Pull day"; then picks 30 minutes, or
 * makes it harder.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const THURSDAY = '2026-09-03T12:00:00.000Z';
const WEEK = { startsAt: '2026-08-31T00:00:00.000Z', endsAt: '2026-09-07T00:00:00.000Z' };

async function pullDayLoadedInDeloadWeek() {
  const handle = createTestStore({ now: () => THURSDAY });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(THURSDAY), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, THURSDAY),
  );
  const db = await handle.store.getDatabase();
  await db.put('workouts', {
    ...record(
      0,
      'barbell-bench-press',
      [
        [10, 100, 2],
        [10, 100, 2],
        [10, 100, 2],
      ],
      [8, 12],
      2,
    ),
    id: 'w-bench-monday',
    startedAt: MONDAY,
    completedAt: MONDAY,
  });
  await handle.store.hydrate();
  expect(handle.store.getSnapshot().session!.workout.templateId).toBe('pull-arms');
  const saved = await handle.store.saveCurrentWorkout('Pull day');
  await handle.store.planDeloadWeek({ recommended: true, window: WEEK, reasons: ['Synthetic.'] });
  // The day's own plan is the deload's: the row at three sets, three in reserve.
  expect(row(handle).sets.filter((set) => set.kind === 'working').length).toBe(3);
  handle.store.loadSavedWorkout(saved.id);
  return handle;
}

type Handle = ReturnType<typeof createTestStore>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');
function row(handle: Handle): WorkoutEntry {
  const entry = allEntries(session(handle).workout.blocks).find(
    (one) => one.exerciseId === 'barbell-row',
  );
  expect(entry, lifts(handle)).toBeDefined();
  return entry!;
}
const rowSets = (handle: Handle) => row(handle).sets.filter((set) => set.kind === 'working');

describe('a saved workout loaded in a deload week', () => {
  it('keeps the deload week that covers today', async () => {
    const handle = await pullDayLoadedInDeloadWeek();
    // On ce935fe, 6af588c and 03a1bef: null.
    expect(session(handle).constraints.deload).toEqual(WEEK);
  });

  it('built again for 30 minutes, is the deload week’s', async () => {
    const handle = await pullDayLoadedInDeloadWeek();
    expect((await handle.store.setDurationChoice(30))?.ok).toBe(true);
    // The day's own plan for 30 minutes in the week: "barbell-row x3 @RIR 3/3/3; chin-up x2 @RIR
    // 2/2; ...". On ce935fe, 6af588c and 03a1bef the plan of a week with no deload: "barbell-row x3
    // @RIR 2/2/2; chin-up x2 @RIR 1/1; ...".
    expect(rowSets(handle).length, lifts(handle)).toBeLessThanOrEqual(3);
    expect(Math.min(...rowSets(handle).map((set) => set.targetRir)), lifts(handle)).toBe(3);
  });

  it('made harder, goes no further than the deload week’s own plan made harder', async () => {
    const handle = await pullDayLoadedInDeloadWeek();
    expect((await handle.store.recalibrate({ type: 'intensity', direction: 'harder' }))?.ok).toBe(
      true,
    );
    // The day's own plan made harder in the week: "barbell-row x4 @RIR 2/2/2/2". On ce935fe,
    // 6af588c and 03a1bef: "barbell-row x5 @RIR 1/1/1/1/1; chin-up x4 @RIR 0/0/0/0; ...".
    expect(rowSets(handle).length, lifts(handle)).toBeLessThanOrEqual(4);
    expect(Math.min(...rowSets(handle).map((set) => set.targetRir)), lifts(handle)).toBe(2);
  });
});
