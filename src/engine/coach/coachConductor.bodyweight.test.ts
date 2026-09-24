import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { recommendNextTarget, summarizeProgression } from '../progression/progression';
import { withSwap } from '../planning/lastingSwaps';
import { prescribe } from '../progression/roles';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries, type EntryProgression } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  FEWER_REPS_SOURCE,
  conductCoach,
  emptyDeclines,
  gatherSignals,
  recordDecline,
  setAsideKey,
  type CoachInput,
} from './coachConductor';

/**
 * Maintenance 21, item 17: a lift done at bodyweight that keeps falling short gets one tap that
 * works without weight, fewer reps over more sets, and the swap is named only where it fits.
 */

const NOW = RECORD_NOW;
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const chinUp = requireExercise('chin-up');

const SHORT: SetSpec[] = [
  [5, null, 1],
  [4, null, 1],
  [4, null, 0],
];

function chinUps(days: number[]): WorkoutRecord[] {
  return days.map((daysAgo) => record(daysAgo, 'chin-up', SHORT, [6, 12], 1));
}

/** Today's workout, its first exercise made a Chin-Up whose target read the given history. */
function input(
  history: WorkoutRecord[],
  place = gym,
  progression?: EntryProgression,
  range: [number, number] = [6, 12],
): CoachInput {
  const workout = generateWorkout({
    profile,
    location: place,
    history,
    now: NOW,
    duration: 'default',
  });
  const target = recommendNextTarget({
    exercise: chinUp,
    role: 'secondary-hypertrophy',
    prescription: prescribe(chinUp, 'secondary-hypertrophy', profile),
    history,
    profile,
    now: NOW,
  });
  const blocks = workout.blocks.map((block, blockIndex) =>
    blockIndex === 0
      ? {
          ...block,
          kind: 'straight' as const,
          entries: [
            {
              ...block.entries[0]!,
              exerciseId: 'chin-up',
              role: 'secondary-hypertrophy' as const,
              progression: progression ?? summarizeProgression(target),
              manual: undefined,
              sets: [0, 1, 2].map((index) => ({
                index,
                kind: 'working' as const,
                targetReps: range,
                targetRir: 1,
                targetWeight: null,
                restSeconds: 90,
              })),
            },
          ],
        }
      : block,
  );
  const fatigue = interpretFatigue(history, NOW, null);
  return {
    workout: { ...workout, blocks },
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    location: place,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
  };
}

describe('a lift done at bodyweight that keeps falling short', () => {
  it('gets fewer reps over more sets as its one tap, with the swap named at the gym', () => {
    const card = conductCoach(input(chinUps([6, 2])));
    expect(card?.signal.source).toBe(FEWER_REPS_SOURCE);
    expect(card?.signal.headline).toBe('Chin-Up: short of 6 reps twice in a row');
    expect(card?.signal.why[0]).toMatch(/^Last: bodyweight × 5, 4, 4/);
    expect(card?.signal.why[1]).toBe(
      'Do fewer reps over more sets, or swap in Lat Pulldown for a few weeks.',
    );
    const action = card?.signal.action;
    expect(action?.kind).toBe('recalibrate');
    if (action?.kind === 'recalibrate') {
      expect(action.label).toBe('4 sets of 3-5 today');
      expect(action.trigger).toMatchObject({ type: 'rep-range', reps: [3, 5], workingDelta: 1 });
    }
    expect(card?.signal.headline).not.toMatch(/micro-deload|stalling/);
    const three = conductCoach(input(chinUps([9, 6, 2])));
    expect(three?.signal.headline).toBe('Chin-Up: short of 6 reps 3 sessions running');
  });

  it('never names an exercise the lifter swapped out for weeks', () => {
    const swaps = withSwap([], 'lat-pulldown', 'chin-up', NOW);
    const card = conductCoach({ ...input(chinUps([6, 2])), swaps });
    expect(card?.signal.source).toBe(FEWER_REPS_SOURCE);
    expect(card?.signal.why[1]).toMatch(/^Do fewer reps over more sets/);
    expect(card?.signal.why.join(' ')).not.toMatch(/Lat Pulldown/);
  });

  it('names no swap at home, where no pulldown fits, and still offers the sets', () => {
    const card = conductCoach(input(chinUps([6, 2]), home));
    expect(card?.signal.source).toBe(FEWER_REPS_SOURCE);
    expect(card?.signal.why[1]).toBe('Do fewer reps over more sets.');
  });

  it('never says micro-deload with nothing lowered, even from a plan saved by an older copy', () => {
    const stale: EntryProgression = {
      mode: 'deload',
      evidence: ['Missed the floor twice in a row: micro-deload 10% and win the reps back.'],
      sessions: 2,
      viaFamily: false,
      confidence: 'medium',
      setsAdvice: 0,
    };
    const signals = gatherSignals(input(chinUps([6, 2]), gym, stale));
    expect(signals.some((signal) => /micro-deload/.test(signal.headline))).toBe(false);
  });
});

describe('where the offer stays away', () => {
  it('is not made once the lift has a set logged or its reps were set by hand', () => {
    const base = input(chinUps([6, 2]));
    const entry = allEntries(base.workout.blocks)[0]!;
    const started = conductCoach({
      ...base,
      status: 'active',
      completed: {
        ...emptyCompleted(),
        sets: [
          {
            entryId: entry.id,
            exerciseId: 'chin-up',
            setIndex: 0,
            kind: 'working',
            reps: 5,
            weight: null,
            rir: 1,
            completedAt: NOW,
            skipped: false,
          },
        ],
      },
    });
    expect(started?.signal.source ?? 'none').not.toBe(FEWER_REPS_SOURCE);
    const blocks = base.workout.blocks.map((block, index) =>
      index === 0
        ? { ...block, entries: [{ ...block.entries[0]!, manual: { reps: true } }] }
        : block,
    );
    const byHand = conductCoach({ ...base, workout: { ...base.workout, blocks } });
    expect(byHand?.signal.source ?? 'none').not.toBe(FEWER_REPS_SOURCE);
  });

  it('is not made on a finished workout, where a "today" tap would change nothing', () => {
    const finished = { ...input(chinUps([6, 2])), status: 'completed' as const };
    const offers = gatherSignals(finished).filter((signal) =>
      [FEWER_REPS_SOURCE, 'extra set', 'capped'].includes(signal.source),
    );
    expect(offers).toEqual([]);
    expect(conductCoach(finished)?.signal.source ?? 'none').not.toBe(FEWER_REPS_SOURCE);
  });

  it('is not made when today asks a different range from the one that was missed', () => {
    // A plan saved with the note "short of 6", but today's sets are 3-6: 5, 4, 4 is inside it.
    const saved: EntryProgression = {
      mode: 'maintain',
      evidence: ['Last: bodyweight × 5, 4, 4 @ RIR 1'],
      sessions: 2,
      viaFamily: false,
      confidence: 'medium',
      setsAdvice: 0,
      short: { sessions: 2, floor: 6 },
    };
    const signals = gatherSignals(input(chinUps([6, 2]), gym, saved, [3, 6]));
    expect(signals.some((signal) => signal.source === FEWER_REPS_SOURCE)).toBe(false);
  });
});

describe('an offer the lifter put away holds no place', () => {
  /** A lift with an offer of its own, moved ahead of today's Chin-Up. */
  function withAhead(base: CoachInput, progression: EntryProgression, weight: number | null) {
    const [chin, donor, ...rest] = base.workout.blocks;
    const ahead = {
      ...donor!,
      kind: 'straight' as const,
      entries: [
        {
          ...donor!.entries[0]!,
          role: 'isolation' as const,
          manual: undefined,
          progression,
          sets: donor!.entries[0]!.sets.map((set) => ({ ...set, targetWeight: weight })),
        },
      ],
    };
    return { ...base, workout: { ...base.workout, blocks: [ahead, chin!, ...rest] } };
  }

  it('lets the Chin-Up offer show once the extra set ahead of it is declined', () => {
    const extraSet: EntryProgression = {
      mode: 'reps',
      evidence: ['Two sessions at the top of the range: an extra set is on the table.'],
      sessions: 3,
      viaFamily: false,
      confidence: 'high',
      setsAdvice: 1,
    };
    const base = withAhead(input(chinUps([6, 2])), extraSet, 40);
    const ahead = allEntries(base.workout.blocks)[0]!;
    // Undeclined, the extra set takes the day's one offer.
    expect(gatherSignals(base).some((signal) => signal.source === 'extra set')).toBe(true);
    expect(gatherSignals(base).some((signal) => signal.source === FEWER_REPS_SOURCE)).toBe(false);
    const declines = recordDecline(
      emptyDeclines(),
      { source: 'extra set', exerciseId: ahead.exerciseId },
      NOW,
    );
    expect(conductCoach({ ...base, declines })?.signal.source).toBe(FEWER_REPS_SOURCE);
  });

  it('never offers the same lift the next thing once its first offer is declined', () => {
    // At the heaviest dumbbell here and at the top of the range twice: both an extra set and the
    // heaviest-weight card would offer this lift another set.
    const both: EntryProgression = {
      mode: 'reps',
      evidence: ['Two sessions at the top of the range: an extra set is on the table.'],
      sessions: 3,
      viaFamily: false,
      confidence: 'high',
      setsAdvice: 1,
      capped: { at: 30 },
    };
    const base = withAhead(input(chinUps([6, 2])), both, 30);
    const ahead = allEntries(base.workout.blocks)[0]!;
    const declines = recordDecline(
      emptyDeclines(),
      { source: 'extra set', exerciseId: ahead.exerciseId },
      NOW,
    );
    const signals = gatherSignals({ ...base, declines });
    expect(
      signals.some(
        (signal) => signal.source === 'capped' && signal.exerciseId === ahead.exerciseId,
      ),
    ).toBe(false);
    // The slot passes to the next lift instead.
    expect(conductCoach({ ...base, declines })?.signal.source).toBe(FEWER_REPS_SOURCE);
  });

  it('shows the next lift’s lowered load once the first one is set aside', () => {
    const deload: EntryProgression = {
      mode: 'deload',
      evidence: ['Missed the floor twice in a row: micro-deload 10% and win the reps back.'],
      sessions: 2,
      viaFamily: false,
      confidence: 'medium',
      setsAdvice: 0,
    };
    const base = withAhead(input([]), deload, 40);
    // A second lowered lift after it: the third block's first entry.
    const third = base.workout.blocks[2]!;
    const blocks = base.workout.blocks.map((block) =>
      block === third
        ? {
            ...block,
            entries: block.entries.map((entry, index) =>
              index === 0
                ? {
                    ...entry,
                    progression: deload,
                    sets: entry.sets.map((set) => ({ ...set, targetWeight: 60 })),
                  }
                : entry,
            ),
          }
        : block,
    );
    const two = { ...base, workout: { ...base.workout, blocks } };
    const [first] = allEntries(two.workout.blocks);
    const second = third.entries[0]!;
    const firstNote = gatherSignals(two).find((signal) => signal.exerciseId === first!.exerciseId);
    expect(firstNote?.headline).toMatch(/micro-deload/);
    const aside = [setAsideKey(firstNote!)];
    const after = gatherSignals({ ...two, accepted: aside });
    expect(
      after.some(
        (signal) => signal.exerciseId === second.exerciseId && /micro-deload/.test(signal.headline),
      ),
    ).toBe(true);
  });
});
