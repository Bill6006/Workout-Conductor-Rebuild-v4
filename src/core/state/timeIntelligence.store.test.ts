import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { COACH_SWITCHES_ID } from '../validation/coachSwitches';
import { TIME_OFFERS_ID } from '../validation/timeOffers';
import { GOALS_TIME_SOURCE } from '../../engine/coach/coachConductor';
import { allEntries, type DurationChoice } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 34 in the store: a day of the plan's plan carries the week's need and keeps it for
 * every rebuild; "Longer would help" taken sets the length and is answered at the workout's end,
 * "Not now" kept for the week; the kinds of coaching switched in Settings; the honest card's Not now
 * keeping its reading. TEST_NOW is a Wednesday; the schedule here ticks every weekday. Synthetic data
 * only.
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyWeekday: Partial<UserProfile> = {
  schedule: {
    ...schedule,
    availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    weeklyFrequency: 5,
  },
};

async function lifter(changes: Partial<UserProfile> = everyWeekday) {
  const handle = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...changes },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  // Training last week: a lifter with a week to plan.
  const db = await handle.store.getDatabase();
  const when = daysBefore(7);
  await db.put('workouts', {
    ...record(0, 'back-squat', [
      [5, 225, 2],
      [5, 225, 2],
      [5, 225, 2],
    ]),
    id: 'w-last-week',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  return handle;
}
type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;

describe('the week’s need on a day of the plan', () => {
  it('is kept with the plan, what today owes each muscle', async () => {
    const handle = await lifter();
    const carry = session(handle).constraints.carry;
    expect(carry).toBeDefined();
    for (const [muscle, sets] of Object.entries(carry!)) {
      expect(MUSCLE_IDS).toContain(muscle);
      expect(sets).toBeGreaterThanOrEqual(1);
    }
  });

  it('is carried through a rebuild', async () => {
    const handle = await lifter();
    const carry = session(handle).constraints.carry;
    expect((await handle.store.setDurationChoice(45))?.ok).toBe(true);
    expect(session(handle).constraints.carry).toEqual(carry);
  });

  it('is the fresh plan’s when the plan is made again: a deload week planned today carries none', async () => {
    const handle = await lifter();
    expect(session(handle).constraints.carry).toBeDefined();
    // A length chosen first: the plan made again is rebuilt with the day's choices on it.
    expect((await handle.store.setDurationChoice(45))?.ok).toBe(true);
    await handle.store.planDeloadWeek({
      recommended: true,
      window: { startsAt: daysBefore(1), endsAt: new Date(Date.parse(TEST_NOW) + 6 * DAY).toISOString() },
      reasons: ['Fatigue high (score 5).'],
    });
    expect(session(handle).constraints.deload).not.toBeNull();
    expect(session(handle).duration).toBe(45);
    expect(session(handle).constraints.carry).toBeUndefined();
  });

  it('is none on a day off the plan: its catch-up is built from the week already', async () => {
    const handle = await lifter({});
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    expect(session(handle).constraints.carry).toBeUndefined();
  });
});

/** The lifter at the shortest length that brings the suggestion, and the suggestion. */
async function offered(handle: Handle) {
  for (const choice of [15, 30, 45] as DurationChoice[]) {
    expect((await handle.store.setDurationChoice(choice))?.ok).toBe(true);
    const offer = handle.store.longerOfferFor();
    if (offer) return offer;
  }
  throw new Error('no length brought the suggestion');
}

describe('"Longer would help"', () => {
  it('takes the next length up, its answer waiting for the workout’s end', async () => {
    const handle = await lifter();
    const offer = await offered(handle);
    expect((await handle.store.takeLonger(offer))?.ok).toBe(true);
    expect(session(handle).duration).toBe(offer.choice);
    expect(handle.store.getSnapshot().timeOffers.pending).toMatchObject({
      week: offer.week,
      muscles: offer.muscles,
      to: offer.minutes,
    });
    // The workout done, a set logged: the answer is kept, the time read from the sets' own clock.
    handle.store.startWorkout();
    const entry = allEntries(session(handle).workout.blocks)[0]!;
    const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
    await handle.store.logSet(entry.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[1],
      rir: 2,
    });
    await handle.store.finishWorkout(null);
    const offers = handle.store.getSnapshot().timeOffers;
    expect(offers.pending).toBeNull();
    // At a fixed clock no time passed: taken, and not trained longer.
    expect(offers.answers.map((answer) => answer.answer)).toEqual(['same']);
    const db = await handle.store.getDatabase();
    expect(await db.get('meta', TIME_OFFERS_ID)).toMatchObject({ answers: [{ answer: 'same' }] });
  });

  it('keeps "Not now" for the week: the same muscles are not offered again', async () => {
    const handle = await lifter();
    const offer = await offered(handle);
    await handle.store.declineLonger(offer);
    expect(handle.store.getSnapshot().timeOffers.answers.map((answer) => answer.answer)).toEqual([
      'not-now',
    ]);
    const again = handle.store.longerOfferFor();
    for (const muscle of offer.muscles) expect(again?.muscles ?? []).not.toContain(muscle);
  });

  it('is never offered once Settings turns it off, and the switch is kept', async () => {
    const handle = await lifter();
    await offered(handle);
    await handle.store.setCoachSwitch('longer', false);
    expect(handle.store.longerOfferFor()).toBeNull();
    const db = await handle.store.getDatabase();
    expect(await db.get('meta', COACH_SWITCHES_ID)).toMatchObject({ longer: false });
  });
});

describe('the honest goals-versus-time card put away', () => {
  it('keeps its reading, so it comes back only on a material change', async () => {
    const handle = await lifter();
    await handle.store.dismissCoachSignal({
      source: GOALS_TIME_SOURCE,
      domain: 'coverage',
      action: { kind: 'settings', section: 'schedule', label: 'Adjust time' },
      goalsTime: { muscles: ['biceps', 'triceps'], minutes: 30 },
    });
    expect(handle.store.getSnapshot().timeOffers.goalsTime).toMatchObject({
      muscles: ['biceps', 'triceps'],
      minutes: 30,
    });
    // No decline is kept for it: the reading alone decides.
    expect(handle.store.getSnapshot().coachDeclines.declines).toEqual({});
  });
});
