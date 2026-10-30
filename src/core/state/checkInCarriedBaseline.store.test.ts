import { describe, expect, it } from 'vitest';
import type { AppStore } from './appStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { Readiness } from '../../engine/recalibration/types';
import { allEntries } from '../../engine/workout/types';
import { recommendDeload } from '../../engine/planning/deload';
import { interpretFatigue } from '../../engine/recovery/fatigue';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * The fifth adversarial review of Maintenance 33: a check-in told once is saved with every workout
 * of its day, and every reader of the saved check-ins counts it once for each.
 *
 * Steps: a lifter has checked in on three days of the last four weeks (energy 4, sleep 4,
 * motivation 4), each with its workout. Ten days ago they checked in once more, the same, trained,
 * finished, closed the completion screen, and trained the day's next plan (a second workout) too,
 * telling no check-in on it. Today they check in at the scale's middle: energy 3, sleep 3,
 * motivation 3. Or: yesterday they checked in with energy 2 and trained twice the same way.
 *
 * The rule: the report: "Today's check-in is read against the lifter's own four weeks (five or more
 * check-ins), else the scale's middle"; the rule table: "Fewer than five saved check-ins: the scale's
 * middle is the baseline" (judgement, from Hopkins 2000, 10907753: compare to the individual). Four
 * check-ins were told. The deload reads "Saved check-ins with low energy or sleep" over the last
 * three sessions (fatigue.ts); one was told.
 *
 * What happens: since the fourth pass every plan of the day keeps the day's check-in
 * (`withDayCheckIn`), so the second workout's record is saved with the check-in told for the first
 * (`buildWorkoutRecord` saves the session's), and `savedCheckIns` reads one per record: five. The
 * baseline is the lifter's own (mean 4, no spread), and today's middle answers read as clearly worse:
 * "Checked in: energy, sleep and motivation under your usual. The plan stays; today's first sets are
 * judged a step easier." Against the scale's middle the same check-in is "Feeling good: full workout
 * kept." A day with two workouts also weighs its check-in twice in the mean and the spread. The one
 * low check-in of yesterday counts two of the last three (`readinessTrend` 2), so the deload names
 * "Low energy or sleep in most recent check-ins." among its signs, which is enough of a sign to
 * recommend one (`recommendDeload`: a dense fortnight, a fatigue score of 4, and any sign). The
 * Progress screen's pain areas (`painPatterns` in analytics.ts) read a record's check-in so too.
 *
 * On the previous head (3d24e37) both tests pass: the day's next plan kept no check-in. A
 * regression of the fourth pass.
 *
 * Synthetic data only.
 *
 * The fix (the fifth pass): a record keeps when its check-in was told (`checkInAt`), and the
 * readers of check-ins as told count one told check-in once (`oncePerCheckIn`).
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TODAY = '2026-09-30T09:00:00.000Z';
const daysAgo = (days: number, hour = 9) =>
  new Date(Date.parse(TODAY) - days * DAY + (hour - 9) * HOUR).toISOString();

const usual: Readiness = {
  energy: 4,
  soreness: 2,
  sleep: 4,
  motivation: 4,
  jointDiscomfort: [],
  timePressure: false,
};
const middle: Readiness = { ...usual, energy: 3, sleep: 3, motivation: 3 };

async function logFirstSet(store: AppStore) {
  const entry = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
  const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
  await store.logSet(entry.id, set.index, {
    weight: set.targetWeight,
    reps: set.targetReps[0],
    rir: set.targetRir,
  });
}

/** A lifter who trains every day of the week, with a workout saved on each of `earlier`'s days. */
async function lifter(clock: { now: string }, earlier: [days: number, Readiness | null][]) {
  const { store } = createTestStore({ now: () => clock.now });
  await store.hydrate();
  const base = createDefaultProfile(clock.now);
  await store.completeOnboarding(
    {
      ...base,
      bodyweight: 185,
      schedule: {
        ...base.schedule,
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        weeklyFrequency: 6,
      },
    },
    createDefaultLocations({ gymAccess: true }, clock.now),
  );
  const db = await store.getDatabase();
  for (const [days, readiness] of earlier) {
    await db.put('workouts', {
      ...record(0, 'barbell-bench-press', [
        [8, 135, 2],
        [8, 135, 2],
      ]),
      id: `w-${days}`,
      startedAt: daysAgo(days),
      completedAt: daysAgo(days, 10),
      readiness,
    });
  }
  return store;
}

/** One check-in told `days` ago, the day's workout and its next plan (a second workout) trained. */
async function twoWorkoutsOneCheckIn(
  store: AppStore,
  clock: { now: string },
  days: number,
  told: Readiness,
) {
  clock.now = daysAgo(days);
  await store.hydrate();
  await store.recalibrate({ type: 'readiness', readiness: told });
  store.startWorkout();
  await logFirstSet(store);
  clock.now = daysAgo(days, 10);
  await store.finishWorkout(null);
  store.dismissCompletion();
  clock.now = daysAgo(days, 14);
  store.startWorkout();
  await logFirstSet(store);
  clock.now = daysAgo(days, 15);
  await store.finishWorkout(null);
  store.dismissCompletion();
}

describe('a check-in told once, on a day with two workouts', () => {
  it('counts once in the lifter’s own baseline', async () => {
    const clock = { now: daysAgo(24) };
    // Three days checked in, each with its workout.
    const store = await lifter(clock, [
      [20, usual],
      [17, usual],
      [14, usual],
    ]);
    // Ten days ago: one check-in, two workouts.
    await twoWorkoutsOneCheckIn(store, clock, 10, usual);

    // Today, at the scale's middle: four check-ins told, fewer than five.
    clock.now = TODAY;
    store.refreshSession();
    await store.recalibrate({ type: 'readiness', readiness: middle });
    expect(store.getSnapshot().session!.lastSummary?.headline).toBe(
      'Feeling good: full workout kept.',
    );
  });

  it('counts once among the recent check-ins the deload reads', async () => {
    const clock = { now: daysAgo(10) };
    const store = await lifter(clock, [[3, null]]);
    // Yesterday: one low check-in (energy 2), two workouts.
    await twoWorkoutsOneCheckIn(store, clock, 1, { ...usual, energy: 2 });

    clock.now = TODAY;
    const { history, profile } = store.getSnapshot();
    const fatigue = interpretFatigue(history, TODAY);
    expect(fatigue.readinessTrend).toBe(1);
    expect(recommendDeload(history, fatigue, profile!, TODAY).reasons).not.toContain(
      'Low energy or sleep in most recent check-ins.',
    );
  });
});
