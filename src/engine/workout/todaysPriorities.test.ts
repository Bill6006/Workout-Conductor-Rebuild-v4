import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW } from '../../test/records';
import type { CatchUpSpec } from '../planning/catchUp';
import { generateWorkout } from '../workoutGenerator/generate';
import { prioritiesToday, priorityLine, withPriorityLine } from './todaysPriorities';
import { allEntries, type GeneratedWorkout } from './types';

/**
 * "Priority muscles today" (the owner, 2026-11-01): the week's ranking, in its own order, kept to the
 * muscles today's session trains. A lifter with bigger arms as a goal: the biceps and the triceps
 * lead the week. Synthetic data only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const plan = (constraints: Parameters<typeof generateWorkout>[0]['constraints']) =>
  generateWorkout({
    profile,
    location: gym,
    history: [],
    now: RECORD_NOW,
    duration: 'default',
    constraints,
  });
const lineOf = (workout: GeneratedWorkout) =>
  workout.explanation.reasons.find((reason) => reason.startsWith('Priority muscles today'));
const musclesOfLift = (exerciseId: string): readonly string[] =>
  requireExercise(exerciseId).primaryMuscles;
const musclesOf = (workout: GeneratedWorkout) =>
  prioritiesToday(workout.musclePriorities, workout.blocks).map((priority) => priority.muscle);

describe('today’s priority muscles (the owner, 2026-11-01)', () => {
  it('names on a lower day only the muscles it trains, in the week’s order', () => {
    // The week's ranking still leads with the arms; the lower day trains neither of them.
    const lower = plan({ templateId: 'lower' });
    expect(lower.musclePriorities.slice(0, 2).map((priority) => priority.muscle)).toEqual([
      'biceps',
      'triceps',
    ]);
    expect(lineOf(lower)).toBe(
      'Priority muscles today: Glutes: not trained yet this cycle, 0 of 10 weekly sets; Hamstrings: not trained yet this cycle, 0 of 10 weekly sets; Quads: not trained yet this cycle, 0 of 10 weekly sets.',
    );
    expect(musclesOf(lower).slice(0, 4)).toEqual(['glutes', 'hamstrings', 'quads', 'abs']);
    // A day that trains the arms leads with them, as before.
    expect(lineOf(plan({ templateId: 'upper' }))).toMatch(
      /^Priority muscles today: Biceps: goal priority, [^;]+; Triceps: goal priority, [^;]+; Chest: /,
    );
  });

  it('counts a muscle a lift works directly with a working set, never one it only touches', () => {
    // The barbell row works the upper back and the lats, and the biceps only secondarily: the
    // biceps lead the week, but are no priority of a day of rows.
    const lower = plan({ templateId: 'lower' });
    const block = structuredClone(lower.blocks[0]!);
    const entry = allEntries([block])[0]!;
    const working = entry.sets.filter((set) => set.kind === 'working');
    expect(working.length).toBeGreaterThan(0);
    entry.exerciseId = 'barbell-row';
    expect(prioritiesToday(lower.musclePriorities, [block]).map((p) => p.muscle)).toEqual([
      'lats',
      'upper-back',
    ]);
    // With its ramp sets alone, a lift trains nothing yet.
    entry.sets = entry.sets.filter((set) => set.kind === 'warmup');
    expect(entry.sets.length).toBeGreaterThan(0);
    expect(prioritiesToday(lower.musclePriorities, [block])).toEqual([]);
    expect(priorityLine(lower.musclePriorities, [block])).toBeNull();
    // A lift this copy of the catalog does not know names nothing, and breaks nothing.
    entry.sets = working;
    entry.exerciseId = 'a-lift-from-a-newer-copy';
    expect(prioritiesToday(lower.musclePriorities, [block])).toEqual([]);
  });

  it('reads the day’s log: never a set skipped, nor one a stopped lift will not do', () => {
    // The lower day under way (the review): its hamstring lifts' working sets skipped, nothing of
    // them logged. Logged or still to come, a set trains; skipped, it does not.
    const lower = plan({ templateId: 'lower' });
    const hamstringLifts = allEntries(lower.blocks).filter((entry) =>
      musclesOfLift(entry.exerciseId).includes('hamstrings'),
    );
    expect(hamstringLifts.length).toBeGreaterThan(0);
    const keys = (sets: { index: number }[], entryId: string) =>
      sets.map((set) => `${entryId}:${set.index}`);
    const working = (entry: (typeof hamstringLifts)[number]) =>
      entry.sets.filter((set) => set.kind === 'working');
    const skipped = new Set(hamstringLifts.flatMap((entry) => keys(working(entry), entry.id)));
    const none = new Set<string>();
    expect(musclesOf(lower)).toContain('hamstrings');
    expect(
      prioritiesToday(lower.musclePriorities, lower.blocks, { logged: none, done: skipped }).map(
        (priority) => priority.muscle,
      ),
    ).not.toContain('hamstrings');
    // One working set of them logged: they trained today.
    const first = hamstringLifts[0]!;
    const one = new Set(keys(working(first).slice(0, 1), first.id));
    expect(
      prioritiesToday(lower.musclePriorities, lower.blocks, { logged: one, done: skipped }).map(
        (priority) => priority.muscle,
      ),
    ).toContain('hamstrings');
    // Nothing logged or skipped yet: every set still to come trains.
    expect(
      prioritiesToday(lower.musclePriorities, lower.blocks, { logged: none, done: none }),
    ).toEqual(prioritiesToday(lower.musclePriorities, lower.blocks));
    // A lift stopped whose logged set was taken back does no more sets: it trains nothing now.
    const stopped = structuredClone(lower.blocks);
    for (const entry of allEntries(stopped)) {
      if (musclesOfLift(entry.exerciseId).includes('hamstrings')) {
        entry.stopped = { owed: 2, why: 'swap' };
      }
    }
    expect(
      prioritiesToday(lower.musclePriorities, stopped, { logged: none, done: none }).map(
        (priority) => priority.muscle,
      ),
    ).not.toContain('hamstrings');
  });

  it('says nothing where the plan trains no muscle', () => {
    // A catch-up the lifter emptied, laid out again: no lift, no priority muscle today.
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    const emptied = plan({ catchUp: spec, emptiedLayouts: ['catch-up'] });
    expect(allEntries(emptied.blocks)).toEqual([]);
    expect(lineOf(emptied)).toBeUndefined();
    expect(emptied.explanation.reasons.every((reason) => typeof reason === 'string')).toBe(true);
  });

  it('puts the line in place of the one before, drops it, or adds it before the place’s line', () => {
    const before = ['Goal: a line.', 'Priority muscles today: Quads.', 'Built for Gym, a line.'];
    expect(withPriorityLine(before, 'Priority muscles today: Glutes.')).toEqual([
      'Goal: a line.',
      'Priority muscles today: Glutes.',
      'Built for Gym, a line.',
    ]);
    expect(withPriorityLine(before, null)).toEqual(['Goal: a line.', 'Built for Gym, a line.']);
    expect(
      withPriorityLine(['Goal: a line.', 'Built for Gym, a line.'], 'Priority muscles today: Abs.'),
    ).toEqual(['Goal: a line.', 'Priority muscles today: Abs.', 'Built for Gym, a line.']);
    expect(withPriorityLine(['Goal: a line.'], 'Priority muscles today: Abs.')).toEqual([
      'Goal: a line.',
      'Priority muscles today: Abs.',
    ]);
    expect(withPriorityLine(['Goal: a line.'], null)).toEqual(['Goal: a line.']);
  });
});
