import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import type { StrategyInsight } from '../strategy/strategy';
import { allEntries, type WorkoutBlock } from '../workout/types';
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
