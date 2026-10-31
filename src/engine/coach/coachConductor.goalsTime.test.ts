import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { localWeekKey } from '../../core/time/localDate';
import { emptyTimeOffers, type TimeOffers } from '../../core/validation/timeOffers';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { generateWorkout } from '../workoutGenerator/generate';
import { withAnswer } from '../planning/timeAnswers';
import {
  GOALS_TIME_SOURCE,
  TOO_SOON_SOURCE,
  gatherSignals,
  isNudge,
  type CoachInput,
} from './coachConductor';

/**
 * Maintenance 34, the honest goals-versus-time card: three weeks running of the goals' muscles under
 * the floor at short lengths bring one plain card, Adjust time opening the schedule; Not now keeps
 * its reading, and it comes back only on a material change; what "Longer would help" learned words
 * it; Settings turns it off, and the "too soon" card too. The default lifter (bigger arms second, a
 * 60-minute Default). Every time is a clock time on this device: Thursday, October 29, 2026 is now.
 * Synthetic data only.
 */

const profile = { ...createDefaultProfile('2026-10-01T12:00:00.000Z'), bodyweight: 185 };
const [, gym] = createDefaultLocations({ gymAccess: true }, '2026-10-01T12:00:00.000Z');
const NOW = new Date(2026, 9, 29, 12).toISOString();

/** A squat day with a set of curls, planned at 30 minutes. */
function short(day: number): WorkoutRecord {
  const when = new Date(2026, 9, day, 18).toISOString();
  const squat = record(0, 'back-squat', [
    [5, 225, 2],
    [5, 225, 2],
    [5, 225, 2],
  ]);
  const curl = record(0, 'ez-bar-curl', [[10, 60, 2]]);
  return {
    ...squat,
    id: `w-${day}`,
    startedAt: when,
    completedAt: when,
    plannedMinutes: 30,
    entries: [...squat.entries, ...curl.entries],
  };
}

const weeks = [6, 8, 13, 15, 20, 22].map(short);

function input(patch: Partial<CoachInput> = {}): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: weeks,
    now: NOW,
    duration: 'default',
  });
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history: weeks,
    now: NOW,
    fatigue: interpretFatigue(weeks, NOW),
    strategy: [],
    lastExportAt: NOW,
    workoutCount: weeks.length,
    ...patch,
  };
}

const card = (coach: CoachInput) =>
  gatherSignals(coach).find((signal) => signal.source === GOALS_TIME_SOURCE);

describe('the honest goals-versus-time card', () => {
  it('says the goals’ muscles stayed under the floor for three weeks, and offers the schedule', () => {
    const signal = card(input());
    expect(signal?.headline).toBe('Biceps and triceps under 4 sets a week for 3 weeks');
    expect(signal?.why).toEqual([
      'About 4 hard sets a week is the least that grows a muscle.',
      'Your weeks held about 2 sessions of 30 min.',
    ]);
    expect(signal?.action).toEqual({ kind: 'settings', section: 'schedule', label: 'Adjust time' });
    expect(signal?.goalsTime).toEqual({ muscles: ['biceps', 'triceps'], minutes: 30 });
    // A new card, held to the card limits.
    expect(isNudge(signal!)).toBe(true);
  });

  it('shows on Today’s plan before it starts, never mid-workout', () => {
    expect(card(input({ status: 'active' }))).toBeUndefined();
  });

  it('stays away once put away until the reading changes materially', () => {
    const kept: TimeOffers = {
      ...emptyTimeOffers(),
      goalsTime: { at: NOW, muscles: ['biceps', 'triceps'], minutes: 30 },
    };
    expect(card(input({ timeOffers: kept }))).toBeUndefined();
    // Put away at 40 minutes: 30 is a quarter less, a material change.
    const before: TimeOffers = {
      ...kept,
      goalsTime: { at: NOW, muscles: ['biceps', 'triceps'], minutes: 40 },
    };
    expect(card(input({ timeOffers: before }))).toBeDefined();
    // Put away for the biceps alone: other muscles now.
    const other: TimeOffers = { ...kept, goalsTime: { at: NOW, muscles: ['biceps'], minutes: 30 } };
    expect(card(input({ timeOffers: other }))).toBeDefined();
  });

  it('says what "Longer would help" learned: the shorter session chosen', () => {
    const answers = [27, 28].reduce(
      (record, day) =>
        withAnswer(record, {
          at: new Date(2026, 9, day, 9).toISOString(),
          week: localWeekKey(new Date(2026, 9, day, 9).toISOString()),
          muscles: ['biceps'],
          from: 30,
          to: 45,
          answer: 'not-now',
        }),
      emptyTimeOffers(),
    );
    expect(card(input({ timeOffers: answers }))?.why.at(-1)).toBe(
      'When a longer session was offered, you chose the shorter one.',
    );
  });

  it('is off when Settings turns it off', () => {
    expect(card(input({ switches: { tooSoon: true, goalsTime: false } }))).toBeUndefined();
  });
});

describe('the "too soon" card, turned off', () => {
  // The bench press 20 hours ago, a rep short of failure: the chest inside its window today.
  const bench = {
    ...record(
      20 / 24,
      'barbell-bench-press',
      [
        [8, 100, 1],
        [8, 100, 1],
        [8, 100, 1],
        [8, 100, 1],
      ],
      [6, 10],
      1,
    ),
    id: 'bench-yesterday',
  };
  const coach = (switches?: CoachInput['switches']): CoachInput => {
    const workout = generateWorkout({
      profile,
      location: gym,
      history: [bench],
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    return {
      workout,
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile,
      history: [bench],
      now: RECORD_NOW,
      fatigue: interpretFatigue([bench], RECORD_NOW),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: 1,
      ...(switches ? { switches } : {}),
    };
  };
  const tooSoon = (input: CoachInput) =>
    gatherSignals(input).filter((signal) => signal.source.startsWith(`${TOO_SOON_SOURCE}|`));

  it('shows on, and not when Settings turns it off', () => {
    expect(tooSoon(coach()).length).toBeGreaterThan(0);
    expect(tooSoon(coach({ tooSoon: false, goalsTime: true }))).toEqual([]);
  });
});
