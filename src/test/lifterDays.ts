import { createDefaultLocations } from '../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../core/validation/profile';
import type { WorkoutSession } from '../core/state/session';
import { allEntries, type GeneratedWorkout } from '../engine/workout/types';
import { createTestStore } from './testStore';

/**
 * Round M's fresh review before shipping: a lifter who does the app's own plans through the store, day by day,
 * on a clock that moves (synthetic data only). `at(day, hour)` is this device's clock, September
 * 2026, the 7th a Monday (src/test/clockDays.ts).
 */

export type Clock = { now: string };

export async function lifterStore(start: string, changes: Partial<UserProfile> = {}) {
  const clock: Clock = { now: start };
  const handle = createTestStore({ now: () => clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(clock.now), bodyweight: 185, ...changes },
    createDefaultLocations({ gymAccess: true }, clock.now),
  );
  return { ...handle, clock };
}

export type Lifter = Awaited<ReturnType<typeof lifterStore>>;

export const sessionOf = (lifter: Lifter): WorkoutSession => lifter.store.getSnapshot().session!;

/**
 * Today's plan begun and its working sets logged at their targets, the first `lifts` lifts (all of
 * them by default); finished, the summary put away. The clock does not move.
 */
export async function doToday(
  lifter: Lifter,
  options: { lifts?: number; endedEarly?: boolean } = {},
): Promise<void> {
  lifter.store.refreshSession();
  lifter.store.startWorkout();
  const entries = allEntries(sessionOf(lifter).workout.blocks);
  const lifts = options.lifts ?? entries.length;
  for (const [position, entry] of entries.entries()) {
    if (position >= lifts) break;
    const current = allEntries(sessionOf(lifter).workout.blocks).find(
      (candidate) => candidate.id === entry.id,
    );
    if (!current) continue;
    for (const set of current.sets.filter((candidate) => candidate.kind === 'working')) {
      await lifter.store.logSet(current.id, set.index, {
        weight: set.targetWeight,
        reps: set.targetReps[0],
        rir: set.targetRir,
      });
    }
  }
  await lifter.store.finishWorkout(null, { endedEarly: options.endedEarly ?? false });
  lifter.store.dismissCompletion();
}

/** Each lift as "id x3 @2/2/2 (+drop) [what it went in for]", for a failure's message. */
export const describe = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => {
    const working = entry.sets.filter((set) => set.kind === 'working');
    const drop = entry.sets.some((set) => set.kind === 'drop') ? ' +drop' : '';
    return `${entry.exerciseId} x${working.length} @${working.map((set) => set.targetRir).join('/')}${drop} [${entry.chosenFor.join(',')}]`;
  });
