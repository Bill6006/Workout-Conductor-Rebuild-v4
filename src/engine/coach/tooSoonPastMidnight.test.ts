import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { Readiness } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { generateWorkout } from '../workoutGenerator/generate';
import { TOO_SOON_SOURCE, gatherSignals, type CoachInput } from './coachConductor';

/**
 * Maintenance 33, the third review: the coach's "too soon" reads the day's context as every reader
 * of the windows does, the check-in the day's its session was made on (`dayRecovery`'s `madeAt`).
 * Past midnight, a short night told on the evening the session was made is none of today's.
 *
 * Steps: four bench press sets a rep short of failure 30 h ago (the chest's window 36 h, 48 h after
 * a short night; "too soon" warns inside three quarters of it). Today's plan is the push day; the
 * session's check-in says sleep "Short". Made today, the chest's card shows; made the day before,
 * it does not, as on a day with no short night. Synthetic data only.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);

const shortNight: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 2,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

const history: WorkoutRecord[] = [
  {
    ...record(
      30 / 24,
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
    id: 'bench-30h',
  },
];

function chestCard(readiness: Readiness | null, madeAt?: string) {
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const input: CoachInput = {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: { ...emptyConstraints(), readiness },
    profile,
    history,
    now: RECORD_NOW,
    fatigue: interpretFatigue(history, RECORD_NOW),
    strategy: [],
    lastExportAt: RECORD_NOW,
    workoutCount: history.length,
    ...(madeAt ? { madeAt } : {}),
  };
  return gatherSignals(input).find((signal) =>
    signal.source.startsWith(`${TOO_SOON_SOURCE}|chest|`),
  );
}

describe('"too soon" past midnight', () => {
  it('reads the check-in of the session’s day as none of today’s', () => {
    // The controls: with no short night the 30 h are past three quarters of the chest's 36 h; with
    // one told today, inside three quarters of its 48 h.
    expect(chestCard(null)).toBeUndefined();
    expect(chestCard(shortNight, RECORD_NOW)).toBeDefined();
    const yesterday = new Date(Date.parse(RECORD_NOW) - 24 * 3_600_000).toISOString();
    expect(chestCard(shortNight, yesterday)).toBeUndefined();
  });
});
