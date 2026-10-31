import { describe, expect, it } from 'vitest';
import { JOINTS } from '../../catalog/exercises/exerciseSchema';
import { createDefaultLocations, createLocation } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { LocationProfile } from '../../core/validation/location';
import { entryAlternatives, harderAlternatives } from '../alternatives/entryAlternatives';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { SessionConstraints } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import type { WorkoutBlock, WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { gatherSignals, type CoachInput } from './coachConductor';

/**
 * The coach offers "A harder variation" for a lift held at the heaviest weight here only where the
 * lift's own sheet lists one (the owner, 2026-10-31: Dumbbell Row at home, held at 50 lb, offered
 * the button, and its sheet said "No safe alternative fits Home and your limitations"). The sheet's
 * list and the coach's are one (`entryAlternatives`). With none, the reps climb on and nothing is
 * offered until they reach the top, where the extra set comes. Synthetic data only.
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [home] = createDefaultLocations({ gymAccess: true }, NOW);
/** A home with dumbbells and nothing else: no bench for a chest-supported row. */
const dumbbellsOnly = createLocation(
  { id: 'dumbbells-only', name: 'Home', kind: 'home', equipment: ['adjustable-dumbbells'] },
  NOW,
);

/** Dumbbell Row held at 50 lb, its reps at `low`-`top`, with another lift beside it. */
function rowAtTheCap(
  top = 8,
  others: string[] = [],
): { blocks: WorkoutBlock[]; row: WorkoutEntry } {
  const row: WorkoutEntry = {
    id: 'e-row',
    exerciseId: 'dumbbell-row',
    role: 'primary-hypertrophy',
    sets: [1, 2, 3].map((index) => ({
      index,
      kind: 'working' as const,
      targetReps: [top - 2, top] as [number, number],
      targetWeight: 50,
      targetRir: 2,
      restSeconds: 90,
    })),
    restSeconds: 90,
    warmupSets: 1,
    dropSet: false,
    chosenFor: ['upper-back', 'lats'],
    locked: false,
    pinned: false,
    progression: {
      mode: 'weight',
      sessions: 2,
      setsAdvice: 0,
      capped: { at: 50 },
      evidence: ['Held at the heaviest weight here (50 lb): the reps go up instead.'],
      confidence: 'medium',
    } as WorkoutEntry['progression'],
  };
  const blocks: WorkoutBlock[] = [
    {
      id: 'b-row',
      kind: 'straight',
      label: 'A Dumbbell Row',
      entries: [row],
      rounds: 3,
      restBetweenRoundsSeconds: 90,
    },
    ...others.map((exerciseId, at) => ({
      id: `b-${at}`,
      kind: 'straight' as const,
      label: exerciseId,
      entries: [{ ...row, id: `e-${at}`, exerciseId, progression: undefined }],
      rounds: 3,
      restBetweenRoundsSeconds: 90,
    })),
  ];
  return { blocks, row };
}

function coachInput(
  blocks: WorkoutBlock[],
  location: LocationProfile | undefined,
  constraints: SessionConstraints = emptyConstraints(),
): CoachInput {
  const workout = generateWorkout({
    profile,
    location: home,
    history: [],
    now: NOW,
    duration: 'default',
  });
  const fatigue = interpretFatigue([], NOW);
  return {
    workout: { ...workout, blocks },
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints,
    profile,
    history: [],
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history: [], profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: 0,
    ...(location ? { location } : {}),
  };
}

const sheetOf = (input: CoachInput, row: WorkoutEntry) =>
  entryAlternatives({
    profile: input.profile,
    location: input.location,
    workout: input.workout,
    block: input.workout.blocks.find((block) => block.entries.includes(row))!,
    entry: row,
    constraints: input.constraints,
    completed: input.completed,
    history: input.history,
    now: input.now,
  });

const harderOf = (input: CoachInput, row: WorkoutEntry) =>
  harderAlternatives({
    profile: input.profile,
    location: input.location,
    workout: input.workout,
    block: input.workout.blocks.find((block) => block.entries.includes(row))!,
    entry: row,
    constraints: input.constraints,
    completed: input.completed,
    history: input.history,
    now: input.now,
  });

const cappedCard = (input: CoachInput) =>
  gatherSignals(input).find((signal) => signal.source === 'capped');

describe('"A harder variation" only where the sheet lists one', () => {
  it('offers no dead-end button where the sheet says no safe alternative fits', () => {
    // The owner's case: the one lift the sheet could list at this home is out today.
    const { blocks, row } = rowAtTheCap();
    const input = coachInput(blocks, dumbbellsOnly, {
      ...emptyConstraints(),
      avoidExerciseIds: ['rear-delt-fly'],
    });
    const sheet = sheetOf(input, row);
    expect(sheet.candidates).toEqual([]);
    expect(sheet.emptyReason).toBe('No safe alternative fits Home and your limitations.');
    expect(cappedCard(input)).toBeUndefined();
    expect(gatherSignals(input).some((signal) => signal.action?.kind === 'alternatives')).toBe(
      false,
    );
  });

  it('offers none where the sheet lists only other movements', () => {
    // A rear delt fly is heavier per pound than a row, but no variation of it.
    const { blocks, row } = rowAtTheCap();
    const input = coachInput(blocks, dumbbellsOnly);
    expect(sheetOf(input, row).candidates.map((one) => one.exercise.id)).toEqual(['rear-delt-fly']);
    expect(harderOf(input, row)).toEqual([]);
    expect(cappedCard(input)).toBeUndefined();
  });

  it('offers it where the sheet lists a harder variation, which the sheet then shows first', () => {
    const { blocks, row } = rowAtTheCap();
    const input = coachInput(blocks, home);
    const card = cappedCard(input);
    expect(card?.why).toEqual([
      'The reps go up instead, to 8 this session.',
      'A harder variation keeps the same weight heavy.',
    ]);
    expect(card?.action).toEqual({
      kind: 'alternatives',
      entryId: row.id,
      label: 'A harder variation',
    });
    expect(harderOf(input, row).map((one) => one.exercise.id)).toEqual(['chest-supported-row']);
    const sheet = sheetOf(input, row);
    expect(sheet.candidates[0]?.exercise.id).toBe('chest-supported-row');
    expect(sheet.candidates[0]?.reasons).toContain('still heavy with the weights you have');
  });

  it('offers none where the harder variation is in today’s plan already', () => {
    const { blocks, row } = rowAtTheCap(8, ['chest-supported-row']);
    const input = coachInput(blocks, home);
    expect(
      sheetOf(input, row).candidates.some((one) => one.exercise.id === 'chest-supported-row'),
    ).toBe(false);
    expect(cappedCard(input)).toBeUndefined();
  });

  it('offers none where the variation is out today', () => {
    const { blocks } = rowAtTheCap();
    const input = coachInput(blocks, home, {
      ...emptyConstraints(),
      avoidExerciseIds: ['chest-supported-row'],
    });
    expect(cappedCard(input)).toBeUndefined();
  });

  it('agrees with the sheet whichever joint hurts today', () => {
    for (const joint of JOINTS) {
      const { blocks, row } = rowAtTheCap();
      const input = coachInput(blocks, home, { ...emptyConstraints(), painJoints: [joint] });
      const listed = new Set(sheetOf(input, row).candidates.map((one) => one.exercise.id));
      const harder = harderOf(input, row);
      for (const one of harder) expect(listed.has(one.exercise.id), joint).toBe(true);
      expect(cappedCard(input)?.action?.kind === 'alternatives', joint).toBe(harder.length > 0);
    }
  });

  it('says the reps are at the top where its sets were set by hand, and offers only what the sheet has', () => {
    // An exercise whose sets were changed today takes no set more: at the top of its reps, the
    // harder variation is the one lever, where the sheet lists one.
    const { blocks, row } = rowAtTheCap(20);
    const byHand = blocks.map((block) => ({
      ...block,
      entries: block.entries.map((entry) =>
        entry.id === row.id ? { ...entry, manual: { sets: true } } : entry,
      ),
    }));
    const card = cappedCard(coachInput(byHand, home));
    expect(card?.why).toEqual([
      'The reps are already at the top of the range.',
      'A harder variation keeps the same weight heavy.',
    ]);
    expect(card?.action).toMatchObject({ kind: 'alternatives', label: 'A harder variation' });
    expect(cappedCard(coachInput(byHand, dumbbellsOnly))).toBeUndefined();
  });

  it('ranks nothing as harder for a lift not held at the heaviest weight here', () => {
    const { blocks, row } = rowAtTheCap();
    const free = { ...row, progression: { ...row.progression!, capped: undefined } };
    const unheld = blocks.map((block) => ({
      ...block,
      entries: block.entries.map((entry) => (entry.id === row.id ? free : entry)),
    }));
    const input = coachInput(unheld, home);
    expect(harderOf(input, free)).toEqual([]);
    for (const candidate of sheetOf(input, free).candidates) {
      expect(candidate.reasons).not.toContain('still heavy with the weights you have');
    }
  });

  it('offers the next lever, a set, once the reps reach the top, with no harder variation', () => {
    const { blocks, row } = rowAtTheCap(20);
    const input = coachInput(blocks, dumbbellsOnly);
    const card = cappedCard(input);
    expect(card?.why[0]).toBe('The reps are already at the top of the range.');
    expect(card?.action).toEqual({
      kind: 'recalibrate',
      trigger: { type: 'sets', entryId: row.id, workingDelta: 1 },
      label: 'Add a set',
    });
  });
});
