import { describe, expect, it } from 'vitest';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import type { SplitOrder } from '../../engine/workout/types';
import { RECORD_NOW } from '../../test/records';
import { addLocalDays, localDayKey } from '../time/localDate';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { createSession } from './session';
import { buildWorkoutRecord } from './workoutRecordBuilder';

/**
 * Maintenance 38: a workout keeps the split's order it was trained in, which holds the order for its
 * week (`heldOrder`), only where it trained a day of the order with the session the order gave the
 * day. Synthetic data only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const profile = createDefaultProfile(RECORD_NOW);
const lowerDay = generateWorkout({
  profile,
  location: gym,
  history: [],
  now: RECORD_NOW,
  duration: 'default',
  constraints: { templateId: 'lower' },
});

const order = (today: string): SplitOrder => ({
  days: [
    { day: localDayKey(RECORD_NOW), templateId: today, was: 'upper' },
    { day: localDayKey(addLocalDays(RECORD_NOW, 2)), templateId: 'upper', was: 'lower' },
  ],
  spared: ['quads'],
  fewer: [],
});

function trainedIn(splitOrder: SplitOrder, startedAt: string = RECORD_NOW) {
  const session = createSession('key', lowerDay, RECORD_NOW);
  return buildWorkoutRecord(
    {
      ...session,
      completed: { ...session.completed, startedAt },
      constraints: { ...session.constraints, splitOrder },
    },
    { now: startedAt, elapsedSeconds: 1800, rating: null, endedEarly: false },
  );
}

describe('the split’s order a workout keeps', () => {
  it('is the order it was trained in, on a day the order gave its session', () => {
    expect(trainedIn(order('lower')).splitOrder).toEqual(order('lower'));
  });

  it('is none on a day the order gave another session', () => {
    expect(trainedIn(order('full-body')).splitOrder).toBeUndefined();
  });

  it('is none on a day that is not the order’s', () => {
    expect(trainedIn(order('lower'), addLocalDays(RECORD_NOW, 1)).splitOrder).toBeUndefined();
  });
});
