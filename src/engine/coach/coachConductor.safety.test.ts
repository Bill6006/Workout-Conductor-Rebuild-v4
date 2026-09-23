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
import {
  RATING_PAIN_SOURCE,
  conductCoach,
  gatherSignals,
  isDeclined,
  setAsideKey,
  type CoachInput,
} from './coachConductor';

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

/** A saved workout `daysAgo` whose rating says pain, and where when a joint is given. */
function painRecord(daysAgo: number, joint?: Joint): WorkoutRecord {
  return {
    ...record(daysAgo, 'back-squat', [[5, 185, 2]]),
    title: 'Lower body',
    rating: { effort: 'right', pain: true, ...(joint ? { joint } : {}), energyAfter: 3, note: '' },
  };
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

  it('sets the pain named last time aside for the rest of the workout', () => {
    const last = painRecord(2, 'knee');
    const card = conductCoach(input([last]));
    expect(card?.signal.source).toBe(RATING_PAIN_SOURCE);
    const accepted = [setAsideKey(card?.signal ?? { source: '' })];
    expect(conductCoach({ ...input([last]), accepted })?.signal.source).not.toBe(
      RATING_PAIN_SOURCE,
    );
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

describe('pain named when the last workout was saved', () => {
  const ratingCard = (coachInput: CoachInput) =>
    gatherSignals(coachInput).find((signal) => signal.source === RATING_PAIN_SOURCE);

  it('warns only about exercises that load that joint, and says where it came from', () => {
    const signal = ratingCard(input([painRecord(2, 'knee')]));
    if (!signal) throw new Error('no card');
    const named = allEntries(input().workout.blocks).find(
      (entry) => signal.action?.kind === 'alternatives' && entry.id === signal.action.entryId,
    );
    const stress = named ? requireExercise(named.exerciseId).jointStress.knee : undefined;
    expect(stress === 'moderate' || stress === 'high').toBe(true);
    expect(signal.headline).toBe(
      `Knee pain last time: ${requireExercise(named?.exerciseId ?? '').name} loads it`,
    );
    // "Sep 8, Lower body: knee." first, so it survives a two-line Why.
    expect(signal.why[0]).toBe('Sep 8, Lower body: knee.');
    expect(signal.why[1]).toMatch(/puts (moderate|high) stress on it/);
    expect(signal).toMatchObject({ domain: 'safety', confidence: 'high', severity: 2 });
  });

  it('names nothing when no exercise today loads it, or when the rating did not say where', () => {
    // Nothing in the catalog loads the neck.
    expect(ratingCard(input([painRecord(2, 'neck')]))).toBeUndefined();
    // An older rating said pain without where: nothing is guessed from it.
    expect(ratingCard(input([painRecord(2)]))).toBeUndefined();
  });

  it('goes quiet once a later workout is saved without pain, and not before, however long the break', () => {
    const fine = { ...record(1, 'cable-fly', [[12, 40, 1]]), rating: null };
    expect(ratingCard(input([painRecord(3, 'knee'), fine]))).toBeUndefined();
    expect(ratingCard(input([painRecord(40, 'knee')]))).toBeDefined();
  });

  it('gives way to the card for the same joint marked today, so one Not now quiets both', () => {
    expect(ratingCard(input([painRecord(3, 'knee')], ['knee']))).toBeUndefined();
    expect(ratingCard(input([painRecord(3, 'knee')], ['shoulder']))).toBeDefined();
  });

  it('never warns about the workout that report came from', () => {
    expect(ratingCard({ ...input([painRecord(0, 'knee')]), status: 'completed' })).toBeUndefined();
  });
});
