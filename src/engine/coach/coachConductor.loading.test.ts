import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { DUMBBELLS_KEY } from '../loading/loading';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries, type WorkoutBlock, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { gatherSignals, type CoachInput } from './coachConductor';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function withEntry(
  blocks: WorkoutBlock[],
  entryId: string,
  change: (entry: WorkoutEntry) => WorkoutEntry,
): WorkoutBlock[] {
  return blocks.map((block) => ({
    ...block,
    entries: block.entries.map((entry) => (entry.id === entryId ? change(entry) : entry)),
  }));
}

/** The first exercise held at the heaviest weight its place has, with its reps at `topReps`. */
function heldAtTheHeaviest(
  capAt: number,
  topReps: number,
  setsAdvice: 0 | 1 = 0,
  /** A muscle-building lift well short at the cap: its reps run to its effort (Maintenance 23). */
  effort = false,
): { input: CoachInput; entry: WorkoutEntry } {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: [],
    now: NOW,
    duration: 'default',
  });
  const first = allEntries(workout.blocks)[0];
  if (!first?.progression) throw new Error('expected a progression on the first entry');
  const progression = first.progression;
  const blocks = withEntry(workout.blocks, first.id, (entry) => ({
    ...entry,
    ...(effort ? { role: 'primary-hypertrophy' as const } : {}),
    progression: { ...progression, mode: 'weight', sessions: 2, setsAdvice, capped: { at: capAt } },
    sets: entry.sets.map((set) =>
      set.kind === 'working'
        ? {
            ...set,
            targetReps: [topReps - 2, topReps] as [number, number],
            ...(effort
              ? {
                  targetWeight: capAt,
                  asked: { weight: capAt * 2, reps: [6, 10] as [number, number] },
                }
              : {}),
          }
        : set,
    ),
  }));
  const entry = allEntries(blocks).find((candidate) => candidate.id === first.id);
  if (!entry) throw new Error('entry lost');
  const fatigue = interpretFatigue([], NOW, null);
  return {
    entry,
    input: {
      workout: { ...workout, blocks },
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile,
      history: [],
      now: NOW,
      fatigue,
      strategy: analyzeStrategy({ history: [], profile, now: NOW, fatigue }),
      lastExportAt: NOW,
      workoutCount: 0,
    },
  };
}

describe('the coach at the heaviest weight a place has', () => {
  it('offers a harder variation while the reps still have room', () => {
    const { input, entry } = heldAtTheHeaviest(20, 12);
    const signal = gatherSignals(input).find((candidate) => candidate.source === 'capped');
    expect(signal).toBeDefined();
    expect(signal?.headline).toMatch(/at the heaviest weight here \(20 (lb|kg)\)/);
    expect(signal?.why[0]).toBe('The reps go up instead, to 12 this session.');
    expect(signal?.action).toEqual({
      kind: 'alternatives',
      entryId: entry.id,
      label: 'A harder variation',
    });
    expect(signal?.exerciseId).toBe(entry.exerciseId);
  });

  it('offers one more set once the reps reach the ceiling', () => {
    const { input, entry } = heldAtTheHeaviest(20, 20);
    const signal = gatherSignals(input).find((candidate) => candidate.source === 'capped');
    expect(signal?.why[0]).toBe('The reps are already at the top of the range.');
    expect(signal?.action).toEqual({
      kind: 'recalibrate',
      trigger: { type: 'sets', entryId: entry.id, workingDelta: 1 },
      label: 'Add a set',
    });
  });

  it('lets a set run to its effort climb to thirty reps before offering a set', () => {
    const climbing = gatherSignals(heldAtTheHeaviest(20, 20, 0, true).input).find(
      (candidate) => candidate.source === 'capped',
    );
    expect(climbing?.why[0]).toBe('The reps go up instead, to 20 this session.');
    expect(climbing?.action).toMatchObject({ kind: 'alternatives', label: 'A harder variation' });
    const { input, entry } = heldAtTheHeaviest(20, 30, 0, true);
    const top = gatherSignals(input).find((candidate) => candidate.source === 'capped');
    expect(top?.why[0]).toBe('The reps are already at the top of the range.');
    expect(top?.action).toEqual({
      kind: 'recalibrate',
      trigger: { type: 'sets', entryId: entry.id, workingDelta: 1 },
      label: 'Add a set',
    });
  });

  it('stays quiet when the extra set is already on offer, so the card never carries two actions', () => {
    const { input } = heldAtTheHeaviest(20, 12, 1);
    const signals = gatherSignals(input);
    expect(signals.some((signal) => signal.source === 'capped')).toBe(false);
    expect(signals.some((signal) => signal.source === 'extra set')).toBe(true);
  });
});

describe('the coach’s optional drop set', () => {
  /** The pull day at home, the shrug its only move a drop set could go on, with time to spare. */
  function shrugOnly(top: number | null): CoachInput {
    if (!home) throw new Error('no home');
    const place =
      top === null
        ? home
        : {
            ...home,
            loading: {
              [DUMBBELLS_KEY]: {
                kind: 'dumbbells' as const,
                ranges: [{ from: 5, to: top, step: 5 }],
              },
            },
          };
    const lifter: UserProfile = { ...profile, bodyweight: 185 };
    const workout = generateWorkout({
      profile: lifter,
      location: place,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'pull-arms' },
    });
    const blocks = workout.blocks
      .map((block) => ({
        ...block,
        entries: block.entries.filter(
          (entry) =>
            entry.exerciseId === 'dumbbell-shrug' ||
            (entry.role !== 'isolation' && entry.role !== 'finisher'),
        ),
      }))
      .filter((block) => block.entries.length > 0);
    const allowed: UserProfile = {
      ...lifter,
      programStyle: 'hypertrophy-focus',
      techniques: { ...profile.techniques, dropSets: true },
    };
    const fatigue = interpretFatigue([], NOW, null);
    return {
      workout: {
        ...workout,
        blocks,
        duration: { ...workout.duration, targetMinutes: workout.duration.targetMinutes + 30 },
      },
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile: allowed,
      history: [],
      now: NOW,
      fatigue,
      strategy: analyzeStrategy({ history: [], profile: allowed, now: NOW, fatigue }),
      lastExportAt: NOW,
      workoutCount: 0,
    };
  }

  const offer = (input: CoachInput) =>
    gatherSignals(input).find((signal) => signal.headline.startsWith('Optional drop set'));

  it('is offered on a shrug at a weight it can drop from', () => {
    expect(offer(shrugOnly(null))?.headline).toBe('Optional drop set on Dumbbell Shrug');
  });

  it('is not offered on one the light dumbbells already pushed to its effort', () => {
    const input = shrugOnly(20);
    const shrug = allEntries(input.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-shrug',
    );
    expect(shrug?.sets.find((set) => set.kind === 'working')?.targetReps[1]).toBeGreaterThan(20);
    expect(offer(input)).toBeUndefined();
  });
});
