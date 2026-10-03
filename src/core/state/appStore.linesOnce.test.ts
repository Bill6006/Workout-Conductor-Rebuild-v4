import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { composeSummary } from '../../engine/recalibration/diff';
import {
  SHORTENED_RESTS,
  explanationOnce,
  stepsOnce,
} from '../../engine/workoutGenerator/fittingLog';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { SESSION_KEY, readSession } from './session';

/**
 * Maintenance 25, the owner's item 39, after its review: a plan kept or saved before the fitting
 * log merged its steps still said "Shortened rests toward the realistic minimum." four times, and
 * "What changed" could say one removal twice. Each line is said once where it is read.
 */

/** The owner's pull day as it was stored before the change. */
const OLD_STEPS = [
  'Left out A1 Rear Delt Fly + A2 Dumbbell Curl so the session fits 30 min.',
  SHORTENED_RESTS,
  'Trimmed one set from Chin-Up.',
  SHORTENED_RESTS,
  'Trimmed one set from Chin-Up.',
  SHORTENED_RESTS,
  'Gave Chin-Up back a set: the minutes left fit it.',
  SHORTENED_RESTS,
];

describe('a plan stored before the log merged its steps', () => {
  it('reads back each step once, counted as the log counts it now', () => {
    const merged = stepsOnce(OLD_STEPS);
    expect(merged).toEqual([
      'Left out A1 Rear Delt Fly + A2 Dumbbell Curl so the session fits 30 min.',
      SHORTENED_RESTS,
      'Trimmed 2 sets from Chin-Up.',
      'Gave Chin-Up back a set: the minutes left fit it.',
    ]);
    // Steps merged already read back as they are.
    expect(stepsOnce(merged)).toEqual(merged);
  });

  it('says a reason or a compromise once', () => {
    const workout = {
      explanation: { reasons: ['A.', 'B.', 'A.'], fittingSteps: OLD_STEPS },
      compromises: ['Runs about 3 min over 30 min.', 'Runs about 3 min over 30 min.'],
    };
    const once = explanationOnce(workout);
    expect(once.explanation.reasons).toEqual(['A.', 'B.']);
    expect(once.compromises).toEqual(['Runs about 3 min over 30 min.']);
  });

  it('is read back from the phone’s stored session with each line once', async () => {
    const { store, storage } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const raw = JSON.parse(storage.getItem(SESSION_KEY) ?? '{}') as {
      workout: { explanation: { fittingSteps: string[] } };
    };
    raw.workout.explanation.fittingSteps = OLD_STEPS;
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const session = readSession(storage);
    expect(
      session?.workout.explanation.fittingSteps.filter((line) => line === SHORTENED_RESTS),
    ).toEqual([SHORTENED_RESTS]);
  });

  it('reads back each line of a lift’s own reasons once (from the second review)', async () => {
    const { store, storage } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const raw = JSON.parse(storage.getItem(SESSION_KEY) ?? '{}') as {
      workout: { blocks: { entries: { progression?: { evidence: string[] } }[] }[] };
    };
    const entry = raw.workout.blocks[0]!.entries[0]!;
    const bar = 'Never below the empty bar (45 lb).';
    entry.progression = { ...entry.progression!, evidence: [bar, bar] };
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const session = readSession(storage);
    expect(session?.workout.blocks[0]?.entries[0]?.progression?.evidence).toEqual([bar]);
  });

  it('is loaded from the saved workouts with each line once', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const saved = await store.saveCurrentWorkout('Pull day');
    const db = await store.getDatabase();
    await db.put('savedWorkouts', {
      ...saved,
      workout: {
        ...saved.workout,
        explanation: { ...saved.workout.explanation, fittingSteps: OLD_STEPS },
      },
    });
    await store.hydrate();
    store.loadSavedWorkout(saved.id);
    const steps = store.getSnapshot().session?.workout.explanation.fittingSteps ?? [];
    expect(steps.filter((line) => line === SHORTENED_RESTS)).toHaveLength(1);
    expect(steps).toContain('Trimmed 2 sets from Chin-Up.');
  });
});

describe('what changed', () => {
  it('says a removal once, with its reason, when a note gives the reason', () => {
    const summary = composeSummary({
      headline: 'Protecting your shoulder',
      previous: { blocks: [] } as never,
      next: { blocks: [] } as never,
      changes: [
        {
          entryId: 'e1',
          kind: 'removed',
          exerciseId: 'dumbbell-shrug',
          detail: 'Left out Dumbbell Shrug.',
        },
      ],
      notes: ['Left out Dumbbell Shrug: nothing safe fits right now.'],
    });
    expect(summary.details).toEqual(['Left out Dumbbell Shrug: nothing safe fits right now.']);
  });

  it('says a line once when two parts of a change both say it', () => {
    const summary = composeSummary({
      headline: 'Back after 25 min',
      previous: { blocks: [] } as never,
      next: { blocks: [] } as never,
      changes: [],
      notes: ['The rest of the session starts fresher.', 'The rest of the session starts fresher.'],
    });
    expect(summary.details).toEqual(['The rest of the session starts fresher.']);
  });
});
