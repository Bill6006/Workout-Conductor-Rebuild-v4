import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { illnessOf } from '../../engine/readiness/checkIn';
import type { Readiness } from '../../engine/recalibration/types';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fourth adversarial review of Maintenance 33: a saved workout loaded on a day the check-in
 * names an illness, or a workout discarded after one, takes the illness's gate away.
 *
 * Steps: a hybrid lifter with drop sets on saves a workout they like ("Save today's workout"). Today
 * they check in "Fever or aches": Today shows the rest day and hides Start. On the Plan screen they
 * tap "Use" on the saved workout. (The same with a head cold: every set of today's plan at 2 or more
 * in reserve, no drop set; then "Use".) Or: they start today's workout, log a set, check in "Fever
 * or aches" under way, and discard the workout; or finish there, as the rest day asks ("Finish
 * here"), and close the completion screen.
 *
 * The rule: the approved proposal, part 2: "Illness is a gate. With fever or whole-body symptoms, no
 * session" (Weidner 1997; Dick 2014); the report: "fever or aches all over, a rest day: Today hides
 * Start", and "above the neck, every set keeps two or more reps in reserve, no top set to failure
 * and no drop set". The check-in is the day's (the second review: "a check-in is the day's its
 * session was made on"), and the day's choices hold for every later plan the same day, a saved
 * workout loaded too (Round M, the twenty-second and twenty-third reviews).
 *
 * What happens: `loadSavedWorkout` starts a fresh session from `emptyConstraints()` and carries only
 * Round M's choices of the day, so the check-in is gone: the loaded copy is no rest day (Today shows
 * Start again, its check-in card back to "Quick check-in"), and under a head cold it brings sets
 * at 1 in reserve and its drop set back. A workout discarded (`discardWorkout`, `ensureSession`)
 * gives a fresh preview the same way, Start and all; so does the completion closed after finishing
 * on the fever (`dismissCompletion`): the day's next plan, a second workout or the day's own, can be
 * started on the day the lifter said is a rest day. The illness gate, new in Maintenance 33, is
 * passed by one tap, without a word. (Before Maintenance 33 a check-in was lost the same way, but
 * none made a gate.)
 *
 * The fix (the fourth pass): every plan of the day keeps the day's check-in, as told on it, at the
 * time it was told (`withDayCheckIn`): a saved workout loaded, a workout discarded, the completion
 * closed.
 *
 * Synthetic data only.
 */

const DAY = 86_400_000;
const LIFTS = ['barbell-bench-press', 'back-squat', 'barbell-row'];
const at = (daysAgo: number) => new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();

const checkIn = (illness: NonNullable<Readiness['illness']>): Readiness => ({
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness,
});

async function lifterWithSavedWorkout() {
  const { store } = createTestStore();
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
  const saved = await store.saveCurrentWorkout('Main day');
  return { store, saved };
}

describe('a saved workout loaded on an ill day', () => {
  it('keeps a fever’s rest day', async () => {
    const { store, saved } = await lifterWithSavedWorkout();
    await store.recalibrate({ type: 'readiness', readiness: checkIn('body') });
    expect(illnessOf(store.getSnapshot().session!.constraints.readiness)).toBe('body');

    store.loadSavedWorkout(saved.id);
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('preview');
    // Today hides Start while the check-in says a fever or aches (`TodayScreen`'s `resting`).
    expect(illnessOf(session.constraints.readiness)).toBe('body');
  });

  it('keeps a head cold’s floor', async () => {
    const { store, saved } = await lifterWithSavedWorkout();
    // The copy as saved: a top set at 1 in reserve and a drop set.
    const copy = allEntries(saved.workout.blocks);
    expect(copy.some((entry) => entry.sets.some((set) => set.kind === 'drop'))).toBe(true);
    expect(
      copy.some((entry) => entry.sets.some((set) => set.kind === 'working' && set.targetRir < 2)),
    ).toBe(true);
    await store.recalibrate({ type: 'readiness', readiness: checkIn('head') });

    store.loadSavedWorkout(saved.id);
    const loaded = allEntries(store.getSnapshot().session!.workout.blocks);
    expect(loaded.some((entry) => entry.sets.some((set) => set.kind === 'drop'))).toBe(false);
    expect(
      loaded.every((entry) =>
        entry.sets.every((set) => set.kind !== 'working' || set.targetRir >= 2),
      ),
    ).toBe(true);
    expect(illnessOf(store.getSnapshot().session!.constraints.readiness)).toBe('head');
  });

  it('keeps a fever’s rest day through a workout discarded', async () => {
    const { store } = await lifterWithSavedWorkout();
    store.startWorkout();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const set = first.sets.find((candidate) => candidate.kind === 'working')!;
    await store.logSet(first.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
    await store.recalibrate({ type: 'readiness', readiness: checkIn('body') });
    expect(illnessOf(store.getSnapshot().session!.constraints.readiness)).toBe('body');

    store.discardWorkout();
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('preview');
    expect(illnessOf(session.constraints.readiness)).toBe('body');
  });

  it('keeps a fever’s rest day for the next plan after finishing on it', async () => {
    const { store } = await lifterWithSavedWorkout();
    store.startWorkout();
    const first = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    const set = first.sets.find((candidate) => candidate.kind === 'working')!;
    await store.logSet(first.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
    await store.recalibrate({ type: 'readiness', readiness: checkIn('body') });
    await store.finishWorkout(null, { endedEarly: true });
    store.dismissCompletion();
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('preview');
    expect(illnessOf(session.constraints.readiness)).toBe('body');
  });
});
