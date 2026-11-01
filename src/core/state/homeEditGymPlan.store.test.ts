import { describe, expect, it } from 'vitest';
import { addLocalDays, localWeekday } from '../time/localDate';
import { at } from '../../test/clockDays';
import { createTestStore } from '../../test/testStore';
import { createDefaultLocations, HOME_LOCATION_ID, GYM_LOCATION_ID } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { allEntries } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { liftedAsPlanned } from '../../engine/planning/weeklyPlan';
import { coachContextOf } from '../../features/coach/useCoach';
import type { AppStore } from './appStore';
import { emptyTimeOffers } from '../validation/timeOffers';
import type { DurationChoice } from '../../engine/workout/types';
import { record } from '../../test/records';

/**
 * The owner's report of 2026-11-01: Home's equipment edited, the Gym untouched, and the Gym's plan
 * and its coach card must stay as they were. Home starts with adjustable dumbbells alone and gains
 * an adjustable bench, a pull-up bar and resistance bands. Synthetic data only: three weeks trained
 * at the Gym as planned, every chin-up set two reps short of its floor, so today's pull day carries
 * the coach's "Chin-Up: short of 6 reps 4 sessions running".
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const START = at(17, 9); // Thursday 2026-09-17, 09:00
const TODAY = addLocalDays(START, 21); // Thursday 2026-10-08: a pull day at the Gym

/** Three weeks of the default schedule trained at the Gym as planned, the chin-ups short. */
function threeWeeks(): WorkoutRecord[] {
  const profile = { ...createDefaultProfile(START), bodyweight: 185 };
  const [, gym] = createDefaultLocations({ gymAccess: true }, START);
  let history: WorkoutRecord[] = [];
  for (let offset = 0; offset < 21; offset += 1) {
    const now = addLocalDays(START, offset);
    if (!profile.schedule.availableDays.includes(localWeekday(now))) continue;
    const workout = generateWorkout({ profile, location: gym, history, now, duration: 'default' });
    const record = liftedAsPlanned(now, workout);
    history = [
      ...history,
      {
        ...record,
        id: `w-${offset}`,
        locationId: GYM_LOCATION_ID,
        entries: record.entries.map((entry) =>
          entry.exerciseId === 'chin-up'
            ? {
                ...entry,
                sets: entry.sets.map((set) => ({
                  ...set,
                  reps: 4,
                  targetReps: [6, 12] as [number, number],
                  targetRir: 1,
                })),
              }
            : entry,
        ),
      },
    ];
  }
  return history;
}

/** The coach's card as Today shows it, read from the store as the coach hook reads it. */
function cardOf(store: AppStore, now: string): string {
  const state = store.getSnapshot();
  const context = coachContextOf(
    {
      session: state.session,
      profile: state.profile,
      history: state.readHistory,
      // A backup made today: the reminder to make one is not the card this test is about.
      lastExportAt: now,
      workoutCount: state.workoutCount,
      coachRoutes: state.coachRoutes,
      coachDeclines: state.coachDeclines,
      coachFocus: state.coachFocus,
      locations: state.locations,
      cloud: state.cloud,
      lastingSwaps: state.lastingSwaps,
      learnedResets: state.learnedResets,
      coachShown: state.coachShown,
      readEstimate: state.readEstimate,
      timeOffers: state.timeOffers,
      coachSwitches: state.coachSwitches,
      scheduleMove: state.scheduleMove,
    },
    Date.parse(now),
  );
  const signal = context?.card?.signal;
  return signal ? `${signal.headline} | ${signal.action?.label ?? ''}` : 'none';
}

describe('a Home edit and the Gym plan (the owner, 2026-11-01)', () => {
  it('leaves the Gym plan and its coach card as they were', async () => {
    const clock = { now: TODAY };
    const { store } = createTestStore({ now: () => clock.now, minOverlayMs: 0 });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(START), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, START),
    );
    const db = await store.getDatabase();
    for (const record of threeWeeks()) await db.put('workouts', record);
    await store.hydrate();
    const home = () =>
      store.getSnapshot().locations.find((place) => place.id === HOME_LOCATION_ID)!;
    // Home with adjustable dumbbells alone, before the plan is looked at.
    await store.saveLocation({ ...home(), equipment: ['adjustable-dumbbells'] });
    store.refreshSession();
    expect(store.getSnapshot().profile!.currentLocationId).toBe(GYM_LOCATION_ID);
    const session = () => store.getSnapshot().session!;
    expect(session().workout.templateId).toBe('pull-arms');
    expect(allEntries(session().workout.blocks).map((entry) => entry.exerciseId)).toContain(
      'chin-up',
    );
    const before = structuredClone(session());
    const card = cardOf(store, clock.now);
    expect(card).toBe('Chin-Up: short of 6 reps 4 sessions running | 4 sets of 3-5 today');

    // Two hours on, Home gains a bench, a pull-up bar and bands; then back to Today.
    clock.now = new Date(Date.parse(TODAY) + 2 * 3_600_000).toISOString();
    store.refreshSession();
    await store.saveLocation({
      ...home(),
      equipment: ['adjustable-dumbbells', 'adjustable-bench', 'pull-up-bar', 'resistance-bands'],
    });
    store.refreshSession();

    expect(home().equipment).toHaveLength(4);
    expect(session().id).toBe(before.id);
    expect(session().createdAt).toBe(before.createdAt);
    expect(session().workout).toEqual(before.workout);
    expect(session().constraints).toEqual(before.constraints);
    expect(cardOf(store, clock.now)).toBe(card);
  }, 240_000);
  it('keeps "Longer would help" on the Gym plan as it was', async () => {
    // The review: the offer was kept while every place held, though it reads only the current
    // one. Here the week's two showings free up at 13:00 (one was seven days ago at 13:00): at
    // noon none, kept; at two o'clock a Home edit worked it out again, and an offer came on the
    // Gym plan the edit never changed.
    const noon = '2026-09-02T12:00:00.000Z';
    const clock = { now: noon };
    const schedule = createDefaultProfile(noon).schedule;
    const { store } = createTestStore({ now: () => clock.now, minOverlayMs: 0 });
    await store.hydrate();
    await store.completeOnboarding(
      {
        ...createDefaultProfile(noon),
        bodyweight: 185,
        schedule: {
          ...schedule,
          availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          weeklyFrequency: 5,
        },
      },
      createDefaultLocations({ gymAccess: true }, noon),
    );
    const db = await store.getDatabase();
    const lastWeek = new Date(Date.parse(noon) - 7 * DAY).toISOString();
    await db.put('workouts', {
      ...record(0, 'back-squat', [
        [5, 225, 2],
        [5, 225, 2],
        [5, 225, 2],
      ]),
      id: 'w-last-week',
      startedAt: lastWeek,
      completedAt: lastWeek,
    });
    await store.hydrate();
    expect(store.getSnapshot().profile!.currentLocationId).toBe(GYM_LOCATION_ID);
    // The shortest length that brings the suggestion.
    let choice: DurationChoice | null = null;
    for (const length of [15, 30, 45] as DurationChoice[]) {
      expect((await store.setDurationChoice(length))?.ok).toBe(true);
      if (store.longerOfferFor()) {
        choice = length;
        break;
      }
    }
    expect(choice).not.toBeNull();
    await db.put('meta', {
      ...emptyTimeOffers(),
      shown: [
        new Date(Date.parse(noon) - 7 * DAY + HOUR).toISOString(),
        new Date(Date.parse(noon) - 3 * DAY).toISOString(),
      ],
    });
    await store.hydrate();
    expect(store.longerOfferFor()).toBeNull();

    // Two o'clock: Home edited, the Gym untouched. Today's plan and its offer stay as they were.
    clock.now = new Date(Date.parse(noon) + 2 * HOUR).toISOString();
    store.refreshSession();
    const plan = structuredClone(store.getSnapshot().session!.workout);
    const home = store.getSnapshot().locations.find((place) => place.id === HOME_LOCATION_ID)!;
    await store.saveLocation({
      ...home,
      equipment: ['adjustable-dumbbells', 'adjustable-bench', 'pull-up-bar', 'resistance-bands'],
    });
    expect(store.getSnapshot().session!.workout).toEqual(plan);
    expect(store.longerOfferFor()).toBeNull();
    // The Gym's own record saved again: the offer is worked out afresh, and at this hour it comes.
    const gym = store.getSnapshot().locations.find((place) => place.id === GYM_LOCATION_ID)!;
    await store.saveLocation({ ...gym, name: 'Gym' });
    expect(store.longerOfferFor()).not.toBeNull();
  });
});
