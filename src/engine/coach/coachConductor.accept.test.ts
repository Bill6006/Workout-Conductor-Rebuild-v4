import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { withSwap } from '../planning/lastingSwaps';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import type { StallDiagnosis } from '../strategy/plateau';
import type { StrategyInsight } from '../strategy/strategy';
import { allEntries, isStopped, type WorkoutBlock } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { acceptKey, conductCoach, gatherSignals, type CoachInput } from './coachConductor';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const gym = createDefaultLocations({ gymAccess: true }, NOW).find((place) => place.kind === 'gym');
if (!gym) throw new Error('expected a default gym');

/** The owner's case: triceps under target two weeks running, on a push day led by a press. */
const tricepsGap: StrategyInsight = {
  kind: 'coverage',
  recommendation: 'adjust-volume',
  headline: 'Triceps is under its weekly target',
  why: ['5 of 13 sets this week and 5 of 13 last week.', 'One more set closes the gap.'],
  muscle: 'triceps',
  sessions: 4,
  confidence: 'medium',
  severity: 1,
};

function input(overrides: Partial<CoachInput> = {}): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: [],
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
    history: [],
    now: NOW,
    fatigue: interpretFatigue([], NOW, null),
    strategy: [tricepsGap],
    lastExportAt: NOW,
    workoutCount: 6,
    location: gym,
    ...overrides,
  };
}

function coverageSignal(coachInput: CoachInput) {
  return gatherSignals(coachInput).find((signal) => signal.source === 'strategy: coverage');
}

function withManualSets(blocks: WorkoutBlock[], entryId: string): WorkoutBlock[] {
  return blocks.map((block) => ({
    ...block,
    entries: block.entries.map((entry) =>
      entry.id === entryId ? { ...entry, manual: { ...entry.manual, sets: true } } : entry,
    ),
  }));
}

describe('an offer the lifter took is not made twice', () => {
  it('keeps offering until it is taken, then stays quiet for the session', () => {
    const base = input();
    const card = conductCoach(base);
    expect(card?.signal.headline).toBe('Triceps is under its weekly target');
    if (!card) return;
    // The evidence is two weeks of history: a tap does not change it, so only the memory can.
    expect(conductCoach({ ...base, accepted: [] })?.signal.headline).toBe(card.signal.headline);
    const after = conductCoach({ ...base, accepted: [acceptKey(card.signal)] });
    expect(after?.signal.headline ?? null).not.toBe(card.signal.headline);
  });

  it('keys the memory by where the offer came from and what it said', () => {
    expect(
      acceptKey({ source: 'strategy: coverage', headline: 'Triceps is under its weekly target' }),
    ).toBe('strategy: coverage|*|Triceps is under its weekly target');
    expect(
      acceptKey({
        source: 'extra set',
        exerciseId: 'cable-fly',
        headline: 'Cable Fly: an extra set is on the table',
      }),
    ).toBe('extra set|cable-fly|Cable Fly: an extra set is on the table');
  });
});

describe('where the extra set goes', () => {
  it('goes on direct work for the muscle, never on the heavy lift that opens the session', () => {
    const base = input();
    const entries = allEntries(base.workout.blocks);
    const anchor = entries[0];
    const signal = coverageSignal(base);
    expect(signal?.action?.kind).toBe('recalibrate');
    if (signal?.action?.kind !== 'recalibrate' || signal.action.trigger.type !== 'sets') {
      throw new Error('expected an add-a-set action');
    }
    const target = entries.find(
      (entry) => entry.id === (signal.action as { trigger: { entryId: string } }).trigger.entryId,
    );
    expect(target).toBeDefined();
    expect(target?.id).not.toBe(anchor?.id);
    expect(target?.role).not.toBe('primary-strength');
    expect(requireExercise(target?.exerciseId ?? '').primaryMuscles).toContain('triceps');
    expect(signal.action.trigger.workingDelta).toBe(1);
  });

  it('never stacks on an exercise whose sets were already changed today', () => {
    const base = input();
    const first = coverageSignal(base);
    if (first?.action?.kind !== 'recalibrate' || first.action.trigger.type !== 'sets') {
      throw new Error('expected an add-a-set action');
    }
    const takenId = first.action.trigger.entryId;
    const next = coverageSignal({
      ...base,
      workout: { ...base.workout, blocks: withManualSets(base.workout.blocks, takenId) },
    });
    const action = next?.action;
    if (action?.kind === 'recalibrate' && action.trigger.type === 'sets') {
      expect(action.trigger.entryId).not.toBe(takenId);
    } else {
      // Nothing direct left: an accessory when there is room, else the next session leads with it.
      expect(['recalibrate', 'focus']).toContain(action?.kind);
    }
  });

  it('with no direct work today offers an accessory or the next session, not the main lift', () => {
    const base = input();
    const anchorOnly: WorkoutBlock[] = base.workout.blocks.slice(0, 1);
    const signal = coverageSignal({ ...base, workout: { ...base.workout, blocks: anchorOnly } });
    const action = signal?.action;
    expect(action).toBeDefined();
    if (action?.kind === 'recalibrate') {
      expect(action.trigger.type).toBe('add-exercise');
    } else {
      expect(action?.kind).toBe('focus');
    }
  });
});

describe('the coach and a swap kept for weeks', () => {
  it('never offers the exercise swapped out', () => {
    const base = input();
    const bare = { ...base, workout: { ...base.workout, blocks: base.workout.blocks.slice(0, 1) } };
    const offered = (coachInput: CoachInput) => {
      const action = coverageSignal(coachInput)?.action;
      if (action?.kind !== 'recalibrate' || action.trigger.type !== 'add-exercise') {
        throw new Error('expected an accessory');
      }
      return action.trigger.exerciseId;
    };
    expect(offered(bare)).toBe('cable-triceps-pushdown');
    const swaps = withSwap([], 'cable-triceps-pushdown', 'overhead-triceps-extension', NOW);
    expect(offered({ ...bare, swaps })).not.toBe('cable-triceps-pushdown');
  });
});

describe('the coach and a lift that has stopped', () => {
  it('offers no change to it: the engine would refuse the tap', () => {
    const fading: StrategyInsight = {
      kind: 'rep',
      recommendation: 'increase-rest',
      headline: 'Barbell Bench Press fades late in the sets',
      why: ['Reps fall from 8 to 5 across the sets, three sessions running.'],
      exerciseId: 'barbell-bench-press',
      sessions: 3,
      confidence: 'medium',
      severity: 1,
    };
    const base: CoachInput = { ...input({ strategy: [fading] }), status: 'active' };
    const bench = allEntries(base.workout.blocks)[0]!;
    expect(bench.exerciseId).toBe('barbell-bench-press');
    const aimedAtBench = (coachInput: CoachInput) =>
      gatherSignals(coachInput).filter(
        (signal) =>
          signal.action?.kind === 'recalibrate' &&
          'entryId' in signal.action.trigger &&
          signal.action.trigger.entryId === bench.id,
      );
    // Before the swap, the note offers the longer rest.
    expect(aimedAtBench(base).map((signal) => signal.headline)).toContain(fading.headline);
    const first = bench.sets.findIndex((set) => set.kind === 'working');
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: bench.id,
      sets: bench.sets.slice(0, first + 1).map((set) => ({
        entryId: bench.id,
        exerciseId: bench.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: 8,
        weight: 95,
        rir: 2,
        completedAt: NOW,
      })),
    };
    const swapped = recalibrate({
      trigger: { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout: base.workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: bench.id,
      duration: base.workout.duration.choice,
      profile,
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!swapped.ok) throw new Error(swapped.error);
    const after: CoachInput = { ...base, workout: swapped.workout, completed };
    expect(aimedAtBench(after)).toEqual([]);
  });
});

// The fourth review of Maintenance 22: each case below failed before its fix.
describe('the coach aims its offers at lifts still to do', () => {
  function swapAfter(
    workout: CoachInput['workout'],
    entryId: string,
    exerciseId: string,
    completed: CompletedWork,
  ) {
    const result = recalibrate({
      trigger: { type: 'replace', entryId, exerciseId },
      workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: entryId,
      duration: workout.duration.choice,
      profile,
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    return result.workout;
  }

  it('puts the extra set on the exercise that took over, not on the one that stopped', () => {
    const base: CoachInput = { ...input(), status: 'active' };
    const pushdown = allEntries(base.workout.blocks).find(
      (entry) => entry.exerciseId === 'cable-triceps-pushdown',
    )!;
    const offer = (coachInput: CoachInput) => {
      const action = coverageSignal(coachInput)?.action;
      return action?.kind === 'recalibrate' ? action.label : null;
    };
    expect(offer(base)).toBe('Add a set to Cable Triceps Pushdown');
    const first = pushdown.sets.find((set) => set.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: pushdown.id,
      sets: [
        {
          entryId: pushdown.id,
          exerciseId: pushdown.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 0,
          weight: null,
          rir: null,
          completedAt: NOW,
          skipped: true,
        },
      ],
    };
    const workout = swapAfter(base.workout, pushdown.id, 'overhead-triceps-extension', completed);
    expect(isStopped(allEntries(workout.blocks).find((entry) => entry.id === pushdown.id)!)).toBe(
      true,
    );
    expect(offer({ ...base, workout, completed })).toBe('Add a set to Overhead Triceps Extension');
  });

  it('offers a stalled lift no step once it has stopped', () => {
    const base: CoachInput = { ...input(), status: 'active', strategy: [] };
    const bench = allEntries(base.workout.blocks)[0]!;
    const stall: StallDiagnosis = {
      exerciseId: 'barbell-bench-press',
      kind: 'undershooting',
      exposures: 3,
      totalExposures: 4,
      baselineE1rm: 200,
      latestE1rm: 200,
      effortMet: 0,
      effortUnknown: 0,
      firstDate: NOW,
      lastDate: NOW,
      why: ['Three exposures at the same estimated max, the sets ending easy.'],
    };
    const aimed = (coachInput: CoachInput) =>
      gatherSignals({ ...coachInput, stalls: [stall] }).filter(
        (signal) =>
          signal.action?.kind === 'recalibrate' &&
          'entryId' in signal.action.trigger &&
          signal.action.trigger.entryId === bench.id,
      );
    expect(aimed(base)).toHaveLength(1);
    // Its first working set skipped, then swapped: stopped, with nothing lifted on it.
    const first = bench.sets.find((set) => set.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: bench.id,
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 0,
          weight: null,
          rir: null,
          completedAt: NOW,
          skipped: true,
        },
      ],
    };
    const workout = swapAfter(base.workout, bench.id, 'dumbbell-bench-press', completed);
    expect(isStopped(allEntries(workout.blocks).find((entry) => entry.id === bench.id)!)).toBe(
      true,
    );
    expect(aimed({ ...base, workout, completed })).toEqual([]);
  });

  it('names a lift still to do on the shoulder card, never one that stopped', () => {
    const shoulder = {
      ...profile,
      limitations: { ...profile.limitations, painAreas: ['shoulder' as const] },
    };
    const base: CoachInput = { ...input(), profile: shoulder, status: 'active', strategy: [] };
    const bench = allEntries(base.workout.blocks)[0]!;
    const upTo = bench.sets.findIndex((set) => set.kind === 'working');
    const done: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: bench.id,
      sets: bench.sets.slice(0, upTo + 1).map((set) => ({
        entryId: bench.id,
        exerciseId: bench.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: 8,
        weight: 95,
        rir: 2,
        completedAt: NOW,
      })),
    };
    const workout = swapAfter(base.workout, bench.id, 'dumbbell-bench-press', done);
    // The bench press's one working set deleted from its row: the stopped lift has a set not done.
    const completed = { ...done, sets: done.sets.filter((set) => set.kind !== 'working') };
    const cards = gatherSignals({ ...base, workout, completed }).filter(
      (signal) => signal.source === 'profile limitations',
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.headline).not.toMatch(/Barbell Bench Press/);
    expect(cards[0]!.action).toMatchObject({ kind: 'alternatives' });
    expect(cards[0]!.action?.kind === 'alternatives' ? cards[0]!.action.entryId : null).not.toBe(
      bench.id,
    );
  });
});
