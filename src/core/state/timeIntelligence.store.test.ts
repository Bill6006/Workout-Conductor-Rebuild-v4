import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { COACH_SWITCHES_ID } from '../validation/coachSwitches';
import { TIME_OFFERS_ID } from '../validation/timeOffers';
import { GOALS_TIME_SOURCE } from '../../engine/coach/coachConductor';
import { todaysNeedOf, weekModel } from '../../engine/planning/weekModel';
import { interpretFatigue } from '../../engine/recovery/fatigue';
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
      window: {
        startsAt: daysBefore(1),
        endsAt: new Date(Date.parse(TEST_NOW) + 6 * DAY).toISOString(),
      },
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

/** A lifter whose Default leaves room for the need: 90 minutes, every weekday ticked. */
const roomy: Partial<UserProfile> = {
  schedule: { ...everyWeekday.schedule!, typicalDurationMinutes: 90 },
};
const carriedSets = (handle: Handle) =>
  allEntries(session(handle).workout.blocks).filter((entry) => entry.carried !== undefined);

describe('the week’s need in the plan', () => {
  it('is given to the plan made, and to the plan rebuilt', async () => {
    const handle = await lifter(roomy);
    expect(carriedSets(handle).length).toBeGreaterThan(0);
    expect((await handle.store.setDurationChoice(45))?.ok).toBe(true);
    expect((await handle.store.setDurationChoice('default'))?.ok).toBe(true);
    expect(carriedSets(handle).length).toBeGreaterThan(0);
  });

  it('is read from the week as the store builds it, the coach focus included', async () => {
    const handle = await lifter(roomy);
    await handle.store.setCoachFocus('quads');
    const snapshot = handle.store.getSnapshot();
    const profile = snapshot.profile!;
    const owed = (focus: typeof snapshot.coachFocus) => {
      const week = weekModel({
        profile,
        location: snapshot.locations.find((place) => place.id === profile.currentLocationId),
        history: snapshot.readHistory,
        now: TEST_NOW,
        resets: snapshot.learnedResets,
        focus,
      });
      return Object.fromEntries(
        MUSCLE_IDS.map((muscle) => [muscle, todaysNeedOf(week.muscles[muscle])] as const)
          .filter(([, need]) => need >= 1)
          .map(([muscle, need]) => [muscle, Math.round(need * 2) / 2]),
      );
    };
    // The focus moves the week's sessions ahead, and so what today owes.
    expect(owed(snapshot.coachFocus)).not.toEqual(owed(null));
    expect(session(handle).constraints.carry).toEqual(owed(snapshot.coachFocus));
  });

  it('keeps what a short plan’s time fit cut with the workout saved', async () => {
    const handle = await lifter();
    expect((await handle.store.setDurationChoice(15))?.ok).toBe(true);
    const cut = session(handle).workout.fitCut;
    expect(cut?.length ?? 0).toBeGreaterThan(0);
    handle.store.startWorkout();
    const entry = allEntries(session(handle).workout.blocks)[0]!;
    const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
    await handle.store.logSet(entry.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[1],
      rir: 2,
    });
    await handle.store.finishWorkout(null);
    const saved = handle.store.getSnapshot().history.find((one) => one.id !== 'w-last-week')!;
    expect(saved.fitCut).toEqual(cut);
  });
});

/** Every length the lifter can pick: the suggestion at none of them. */
async function neverOffered(handle: Handle): Promise<void> {
  for (const choice of [15, 30, 45] as DurationChoice[]) {
    expect((await handle.store.setDurationChoice(choice))?.ok, String(choice)).toBe(true);
    expect(handle.store.longerOfferFor(), String(choice)).toBeNull();
  }
}

const checkIn = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

describe('"Longer would help" is held back', () => {
  it('on a day off the plan: its catch-up is the app’s choice for the day', async () => {
    await neverOffered(await lifter({}));
  });

  it('in a deload week', async () => {
    const handle = await lifter();
    await handle.store.planDeloadWeek({
      recommended: true,
      window: {
        startsAt: daysBefore(1),
        endsAt: new Date(Date.parse(TEST_NOW) + 6 * DAY).toISOString(),
      },
      reasons: ['Fatigue high (score 5).'],
    });
    await neverOffered(handle);
  });

  it('on a day of an illness', async () => {
    const handle = await lifter();
    expect(
      (
        await handle.store.recalibrate({
          type: 'readiness',
          readiness: { ...checkIn, illness: 'head' },
        })
      )?.ok,
    ).toBe(true);
    await neverOffered(handle);
  });

  it('on a day of high fatigue', async () => {
    const handle = await lifter();
    const db = await handle.store.getDatabase();
    // Three hard squat sessions in the last three days, two reps nearer failure than planned, rated
    // too hard, the last with pain: no muscle the suggestion is for is worked, nor resting.
    for (const daysAgo of [3, 2, 1]) {
      const when = new Date(Date.parse(TEST_NOW) - (daysAgo + 0.5) * DAY).toISOString();
      await db.put('workouts', {
        ...record(
          0,
          'back-squat',
          [
            [8, 185, 0],
            [8, 185, 0],
          ],
          [8, 12],
          2,
          { rating: { effort: 'too-hard', pain: daysAgo === 1, energyAfter: 2, note: '' } },
        ),
        id: `w-squats-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
    await handle.store.hydrate();
    expect(interpretFatigue(handle.store.getSnapshot().readHistory, TEST_NOW).level).toBe('high');
    await neverOffered(handle);
  });

  it('while the answers rest it: two "Not now" this week', async () => {
    const handle = await lifter();
    const db = await handle.store.getDatabase();
    const answer = (days: number) => ({
      at: daysBefore(days),
      week: '2026-09-28',
      muscles: ['chest'],
      from: 30,
      to: 45,
      answer: 'not-now',
    });
    await db.put('meta', {
      id: TIME_OFFERS_ID,
      shown: [],
      answers: [answer(2), answer(1)],
      pending: null,
    });
    await handle.store.hydrate();
    await neverOffered(handle);
  });

  it('once the workout starts', async () => {
    const handle = await lifter();
    await offered(handle);
    handle.store.startWorkout();
    expect(handle.store.longerOfferFor()).toBeNull();
  });
});

describe('"Longer would help" kept', () => {
  it('writes the day’s one showing once', async () => {
    const handle = await lifter();
    await offered(handle);
    await handle.store.noteLongerShown();
    const shown = handle.store.getSnapshot().timeOffers;
    expect(shown.shown).toHaveLength(1);
    await handle.store.noteLongerShown();
    // The second showing the same day changes nothing, not even the record's copy on screen.
    expect(handle.store.getSnapshot().timeOffers).toBe(shown);
  });

  it('answers nothing for a workout ended with nothing logged', async () => {
    const handle = await lifter();
    const offer = await offered(handle);
    expect((await handle.store.takeLonger(offer))?.ok).toBe(true);
    handle.store.startWorkout();
    await handle.store.finishWorkout(null);
    expect(handle.store.getSnapshot().timeOffers.answers).toEqual([]);
  });
});

describe('"Longer would help" taken', () => {
  it('offers nothing more the same day: the take waits for the workout’s end', async () => {
    const handle = await lifter();
    const offer = await offered(handle);
    expect((await handle.store.takeLonger(offer))?.ok).toBe(true);
    expect(handle.store.longerOfferFor()).toBeNull();
    // Taken back down to where it was offered: still nothing, the take answered at the end.
    const before = handle.store.getSnapshot().timeOffers.pending!;
    const back = ([15, 30, 45] as const).find((length) => length === before.from) ?? 'default';
    expect((await handle.store.setDurationChoice(back))?.ok).toBe(true);
    expect(handle.store.longerOfferFor()).toBeNull();
  });

  it('is answered when the workout began that day and ended after midnight', async () => {
    // The clock of TEST_NOW's own day on this device, moved on by hand.
    const day = new Date(TEST_NOW);
    const local = (date: number, hour: number, minute: number) =>
      new Date(day.getFullYear(), day.getMonth(), date, hour, minute).toISOString();
    let now = TEST_NOW;
    const handle = createTestStore({ now: () => now, minOverlayMs: 0 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyWeekday },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    await db.put('workouts', {
      ...record(0, 'back-squat', [
        [5, 225, 2],
        [5, 225, 2],
        [5, 225, 2],
      ]),
      id: 'w-last-week',
      startedAt: daysBefore(7),
      completedAt: daysBefore(7),
    });
    await handle.store.hydrate();
    const offer = await offered(handle);
    now = local(day.getDate(), 23, 40);
    expect((await handle.store.takeLonger(offer))?.ok).toBe(true);
    now = local(day.getDate(), 23, 45);
    handle.store.startWorkout();
    const entry = allEntries(session(handle).workout.blocks)[0]!;
    const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
    await handle.store.logSet(entry.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[1],
      rir: 2,
    });
    now = local(day.getDate() + 1, 0, 50);
    await handle.store.finishWorkout(null);
    expect(handle.store.getSnapshot().timeOffers.answers).toHaveLength(1);
  });
});
