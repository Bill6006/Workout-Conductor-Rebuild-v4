import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { generateWorkout } from '../workoutGenerator/generate';
import { gatherSignals, type CoachInput } from './coachConductor';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function input(overrides: Partial<CoachInput> = {}): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: [],
    now: NOW,
    duration: 'default',
  });
  const fatigue = interpretFatigue([], NOW, null);
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history: [],
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history: [], profile, now: NOW, fatigue }),
    lastExportAt: null,
    workoutCount: 8,
    ...overrides,
  };
}

describe('the backup reminder and the cloud copy', () => {
  it('asks for a backup when history lives only on the device', () => {
    const signals = gatherSignals(input());
    expect(signals.some((signal) => signal.source === 'backup age')).toBe(true);
  });

  it('stays quiet while the cloud copy is on and current, and returns when it is not', () => {
    expect(
      gatherSignals(input({ cloudCurrent: true })).some((signal) => signal.source === 'backup age'),
    ).toBe(false);
    expect(
      gatherSignals(input({ cloudCurrent: false })).some(
        (signal) => signal.source === 'backup age',
      ),
    ).toBe(true);
  });
});
