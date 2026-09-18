import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { generateWorkout } from '../workoutGenerator/generate';
import { conductCoach, gatherSignals, type CoachInput } from './coachConductor';

const NOW = '2026-09-18T20:00:00.000Z';
const profile = createDefaultProfile(NOW);
const gym = createDefaultLocations({ gymAccess: true }, NOW).find((place) => place.kind === 'gym');
if (!gym) throw new Error('expected a default gym');

function input(hoursAgo: number, status: CoachInput['status'] = 'active'): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: [],
    now: NOW,
    duration: 'default',
  });
  const startedAt = new Date(Date.parse(NOW) - hoursAgo * 3_600_000).toISOString();
  return {
    workout,
    status,
    duration: 'default',
    completed: { ...emptyCompleted(), startedAt },
    constraints: emptyConstraints(),
    profile,
    history: [],
    now: NOW,
    fatigue: interpretFatigue([], NOW, null),
    strategy: [],
    lastExportAt: NOW,
    workoutCount: 0,
  };
}

const unfinished = (coachInput: CoachInput) =>
  gatherSignals(coachInput).find((signal) => signal.source === 'unfinished workout');

describe('a workout left open', () => {
  it('is named once it has sat for hours, with the way to save it', () => {
    const signal = unfinished(input(4));
    expect(signal?.headline).toBe('This workout has been open for 4 hours');
    expect(signal?.action).toEqual({ kind: 'finish', label: 'End and save it' });
    expect(signal?.why[0]).toMatch(/^0 of \d+ exercises have logged sets, and nothing is lost\.$/);
    // It outranks everything but safety, so it is the card the lifter sees.
    expect(conductCoach(input(4))?.signal.source).toBe('unfinished workout');
  });

  it('says a day, then days', () => {
    expect(unfinished(input(30))?.headline).toBe('This workout has been open for a day');
    expect(unfinished(input(50))?.headline).toBe('This workout has been open for 2 days');
  });

  it('stays quiet during a normal session, before one starts, and after it ends', () => {
    expect(unfinished(input(2))).toBeUndefined();
    expect(unfinished(input(6, 'preview'))).toBeUndefined();
    expect(unfinished(input(6, 'completed'))).toBeUndefined();
    expect(unfinished(input(6, 'paused'))).toBeDefined();
  });
});
