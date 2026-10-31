import { describe, expect, it } from 'vitest';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { requireExercise } from '../../catalog/exercises/catalog';
import { addLocalDays, localWeekday } from '../time/localDate';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { weekModel } from '../../engine/planning/weekModel';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { at } from '../../test/clockDays';
import {
  describe as describeWorkout,
  doToday,
  lifterStore,
  sessionOf,
} from '../../test/lifterDays';

/**
 * Fresh review of round M, F1: the week model reads the sessions still to come without the coach
 * focus every plan of those days is built with, so a catch-up is built for a week that will not
 * happen.
 *
 * The rule (docs/reports/maintenance-31.md, "The week model"): "the sets the week's sessions still
 * to come will give, as the plan would build them, one after another, at Default length", and a
 * muscle is behind "when the sets done and still planned fall short of its weekly target". Every
 * plan the store builds reads the coach focus (`ensureSession`: `focusMuscle: focus`) until a
 * workout trains the muscle (`reconcileCoachFocus`), as item 44's own look ahead does since its
 * re-check ("the coach focus every plan gets", `sessionsAhead` in generate.ts). `weekModel` calls
 * `generateWorkout` with no constraints at all (nor the lifter's lasting swaps).
 *
 * The lifters (synthetic): each ticked day's plan done in full at 18:00 from Monday the 31st of
 * August; on the probe day, a day not ticked, the lifter takes the coach's "Lead the next session
 * with ..." at 19:15 (`setCoachFocus`), and the days after are planned by the store at 19:15, each
 * done before the next.
 *
 * 1. Tuesday, Wednesday, Friday and Saturday, four a week (push, pull, lower, upper). Monday the 7th,
 *    focus on the quads: the week model reads upper, lower, pull, push; the store builds lower, pull,
 *    push, lower (no upper day), so the chest gets the push day's sets alone and is short, and the
 *    catch-up leaves it out ("traps, rear-delts, upper-chest, side-delts"). Read with the focus as
 *    the store applies it, the catch-up takes the chest too.
 * 2. Five days (Monday, Tuesday, Thursday, Friday, Saturday). Wednesday the 16th, focus on the lats:
 *    the store builds upper, lower, push, the chest's 10 sets covered (11 to come, none done), but the
 *    week model without the focus counts 7 to come, and the catch-up gives the chest the evening
 *    before an upper day. (Until Maintenance 34 this was a strength lifter on Wednesday the 9th: the
 *    sets the week's need carries since then made that week's Thursday a pull day, focus or none.)
 */

const schedule = createDefaultProfile(at(0)).schedule;

async function offDayWithFocus(changes: Partial<UserProfile>, day: number, focus: MuscleId) {
  const lifter = await lifterStore(at(0, 6), changes);
  const ticked = lifter.store.getSnapshot().profile!.schedule.availableDays;
  for (let each = 0; each < day; each += 1) {
    lifter.clock.now = at(each, 18);
    lifter.store.refreshSession();
    if (ticked.includes(localWeekday(lifter.clock.now))) await doToday(lifter);
  }
  lifter.clock.now = at(day, 19, 15);
  lifter.store.refreshSession();
  await lifter.store.setCoachFocus(focus);
  return lifter;
}

/** The rest of the week as the store plans it, each day done before the next. */
async function restOfWeek(lifter: Awaited<ReturnType<typeof offDayWithFocus>>) {
  const ticked = lifter.store.getSnapshot().profile!.schedule.availableDays;
  const start = lifter.clock.now;
  const plans: GeneratedWorkout[] = [];
  for (let offset = 1; offset <= 6; offset += 1) {
    const date = addLocalDays(start, offset);
    if (localWeekday(date) === 'mon') break;
    if (!ticked.includes(localWeekday(date))) continue;
    lifter.clock.now = date;
    lifter.store.refreshSession();
    plans.push(sessionOf(lifter).workout);
    await doToday(lifter);
  }
  return plans;
}

/** A muscle's sets in plans as the week model counts them: direct in full, secondary at half. */
function setsFor(plans: readonly GeneratedWorkout[], muscle: MuscleId): number {
  return plans
    .flatMap((plan) => allEntries(plan.blocks))
    .reduce((sum, entry) => {
      const exercise = requireExercise(entry.exerciseId);
      const working = entry.sets.filter((set) => set.kind === 'working').length;
      const weight = exercise.primaryMuscles.includes(muscle)
        ? 1
        : exercise.secondaryMuscles.includes(muscle)
          ? 0.5
          : 0;
      return sum + weight * working;
    }, 0);
}

const fourDays: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['tue', 'wed', 'fri', 'sat'], weeklyFrequency: 4 },
};
const fiveDays: Partial<UserProfile> = {
  schedule: {
    ...schedule,
    availableDays: ['mon', 'tue', 'thu', 'fri', 'sat'],
    weeklyFrequency: 5,
  },
};

describe('the week model and the coach focus every plan reads', () => {
  it('baseline: the week the store builds is not the week the model counts', async () => {
    const lifter = await offDayWithFocus(fourDays, 7, 'quads');
    const snapshot = lifter.store.getSnapshot();
    const profile = snapshot.profile!;
    // The week model as the store reads it on Monday (`catchUpFor`: no focus).
    const week = weekModel({
      profile,
      location: snapshot.locations.find((place) => place.id === profile.currentLocationId),
      history: snapshot.readHistory,
      now: lifter.clock.now,
    });
    expect(week.sessionsAhead).toBe(4);
    const plans = await restOfWeek(lifter);
    expect(plans.map((plan) => plan.templateId)).toEqual([
      'lower',
      'pull-arms',
      'push-arms',
      'lower',
    ]);
    // The model counted an upper day's chest work that the week as built never has.
    expect(week.muscles.chest.planned).toBeGreaterThan(setsFor(plans, 'chest'));
    expect(week.muscles.chest.done + setsFor(plans, 'chest')).toBeLessThan(
      week.muscles.chest.target - 2,
    );
  }, 120_000);

  it("puts the chest in Monday's catch-up when the week as built leaves it short", async () => {
    const lifter = await offDayWithFocus(fourDays, 7, 'quads');
    const monday = sessionOf(lifter);
    expect(monday.workout.templateId).toBe('catch-up');
    const caught = monday.constraints.catchUp!.muscles.map((item) => item.muscle);
    // On b826d24: ["traps", "rear-delts", "upper-chest", "side-delts"]; read with the focus as the
    // store applies it: ["traps", "upper-chest", "side-delts", "rear-delts", "chest"].
    expect(caught, describeWorkout(monday.workout).join(' | ')).toContain('chest');
  }, 120_000);

  it('offers no catch-up of the chest the evening before the upper day the store builds', async () => {
    const lifter = await offDayWithFocus(fiveDays, 16, 'lats');
    const wednesday = sessionOf(lifter);
    const caught = wednesday.constraints.catchUp!.muscles.map((item) => item.muscle);
    const snapshot = lifter.store.getSnapshot();
    const profile = snapshot.profile!;
    // The week model as it read before the fix: without the focus.
    const chest = weekModel({
      profile,
      location: snapshot.locations.find((place) => place.id === profile.currentLocationId),
      history: snapshot.readHistory,
      now: lifter.clock.now,
    }).muscles.chest;
    const plans = await restOfWeek(lifter);
    // Baseline: Thursday is the upper day, the bench press in it, and the week as built covers the
    // chest, which the model without the focus counts well short.
    expect(plans.map((plan) => plan.templateId)).toEqual(['upper', 'lower', 'push-arms']);
    expect(setsFor(plans.slice(0, 1), 'chest')).toBeGreaterThan(0);
    expect(chest.done + setsFor(plans, 'chest')).toBeGreaterThanOrEqual(chest.target);
    expect(chest.done + chest.planned).toBeLessThan(chest.target - 2);
    // Read without the focus: ["upper-chest", "side-delts", "chest"], three sets each, the chest's a
    // cable fly; read with the focus as the store applies it, the chest is covered.
    expect(caught, describeWorkout(wednesday.workout).join(' | ')).not.toContain('chest');
  }, 120_000);
});
