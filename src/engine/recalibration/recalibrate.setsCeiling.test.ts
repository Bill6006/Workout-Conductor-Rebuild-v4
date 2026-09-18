import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { MAX_WORKING_SETS, emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { GeneratedWorkout } from '../workout/types';

const NOW = '2026-09-18T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const gym = createDefaultLocations({ gymAccess: true }, NOW).find((place) => place.kind === 'gym');
if (!gym) throw new Error('expected a default gym');

function addSet(workout: GeneratedWorkout, entryId: string) {
  const result = recalibrate({
    trigger: { type: 'sets', entryId, workingDelta: 1 },
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: 'default',
    profile,
    location: gym,
    history: [],
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error('recalibration failed');
  return result;
}

describe('a ceiling on working sets', () => {
  it('stops adding at the ceiling however many times the set is asked for, and says why', () => {
    let workout = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const entryId = allEntries(workout.blocks)[0]?.id;
    if (!entryId) throw new Error('expected an entry');
    const working = () =>
      allEntries(workout.blocks)
        .find((entry) => entry.id === entryId)
        ?.sets.filter((set) => set.kind === 'working').length ?? 0;
    let headline = '';
    for (let taps = 0; taps < 15; taps += 1) {
      const result = addSet(workout, entryId);
      workout = result.workout;
      headline = result.summary.headline;
    }
    expect(working()).toBe(MAX_WORKING_SETS);
    expect(headline).toMatch(
      new RegExp(`stays at ${MAX_WORKING_SETS} working sets: past that another set adds fatigue`),
    );
  });
});
