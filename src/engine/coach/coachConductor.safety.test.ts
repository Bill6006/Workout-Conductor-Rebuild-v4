import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { conductCoach, isDeclined, setAsideKey, type CoachInput } from './coachConductor';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);

/** Today's workout (a lower-body day loads the knee and the lower back), and what the coach reads. */
function input(
  history: WorkoutRecord[] = [],
  painJoints: Joint[] = [],
  templateId = 'lower',
): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: [],
    now: NOW,
    duration: 'default',
    constraints: { templateId },
  });
  return {
    workout,
    status: 'active',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: { ...emptyConstraints(), painJoints },
    profile,
    history,
    now: NOW,
    fatigue: interpretFatigue(history, NOW, null),
    strategy: [],
    lastExportAt: NOW,
    workoutCount: history.length,
  };
}

/** Joints today's exercises load, most loaded first. */
function loadedJoints(coachInput: CoachInput): Joint[] {
  const joints = allEntries(coachInput.workout.blocks).flatMap((entry) =>
    Object.entries(requireExercise(entry.exerciseId).jointStress)
      .filter(([, level]) => level === 'moderate' || level === 'high')
      .map(([joint]) => joint as Joint),
  );
  return [...new Set(joints)];
}

describe('Not now on a safety card', () => {
  it('sets that worry aside for this workout; a new one still shows, and the next workout starts clean', () => {
    const [first, second] = loadedJoints(input());
    if (!first || !second) throw new Error('need two loaded joints');
    expect([first, second].sort()).toEqual(['knee', 'lower-back']);
    const card = conductCoach(input([], [first]));
    expect(card?.signal.domain).toBe('safety');
    expect(card?.signal.concern).toBe(first);

    const accepted = [setAsideKey(card?.signal ?? { source: '' })];
    const setAside = conductCoach({ ...input([], [first]), accepted });
    expect(setAside?.signal.domain).not.toBe('safety');

    // A second joint reported later is a new worry, and it shows.
    const later = conductCoach({ ...input([], [first, second]), accepted });
    expect(later?.signal.domain).toBe('safety');
    expect(later?.signal.concern).toBe(second);

    // The next workout keeps nothing set aside: while the pain is reported, the card is back.
    expect(conductCoach({ ...input([], [first]), accepted: [] })?.signal.concern).toBe(first);
  });

  it('stays away for the rest of the workout when the pain was last session, whichever exercise it names', () => {
    const today = input();
    const [firstEntry, secondEntry] = allEntries(today.workout.blocks);
    if (!firstEntry || !secondEntry) throw new Error('need two exercises');
    // Last session hurt, and it had two of today's lifts in it.
    const last = {
      ...record(2, firstEntry.exerciseId, [[8, 100, 2]]),
      rating: { effort: 'right' as const, pain: true, energyAfter: 3, note: '' },
    };
    const [logged] = last.entries;
    if (!logged) throw new Error('no entry');
    last.entries.push({ ...logged, exerciseId: secondEntry.exerciseId });
    const card = conductCoach(input([last]));
    expect(card?.signal.source).toBe('last rating');
    expect(card?.signal.headline).toContain(requireExercise(firstEntry.exerciseId).name);

    const accepted = [setAsideKey(card?.signal ?? { source: '' })];
    const after = conductCoach({ ...input([last]), accepted });
    expect(after?.signal.source).not.toBe('last rating');
  });

  it('is still never declined for days', () => {
    const [first] = loadedJoints(input());
    const signal = conductCoach(input([], [first as Joint]))?.signal;
    if (!signal) throw new Error('no card');
    const declines = {
      id: 'coach-declines' as const,
      declines: { [`${signal.source}|*`]: { count: 5, lastAt: NOW } },
    };
    expect(isDeclined(declines, signal, NOW)).toBe(false);
  });
});
