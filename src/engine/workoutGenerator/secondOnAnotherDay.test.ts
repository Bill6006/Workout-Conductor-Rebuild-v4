import { describe, expect, it } from 'vitest';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { allEntries } from '../workout/types';
import { TEMPLATES, generateWorkout, secondOnAnotherDay } from './generate';
import { at, profileOf, session } from '../../test/clockDays';

/**
 * The twenty-fourth review of round M: a saved second workout loaded on another day than it was
 * saved says nothing of a day trained (`secondOnAnotherDay`). One built from its muscles is a
 * catch-up of them, laid out as it was, at the doses it had, nothing sitting out; one laid out on the
 * split's day, as with nothing behind, is that day's plan.
 *
 * At home with dumbbells, after a full-body workout this morning: a second workout for the forearms
 * (behind) and what is left of the traps' session, or one with nothing behind (the split's day
 * without what was trained). Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(9, 18);
const profile = profileOf();
const records = [
  session(at(5, 18), [['leg-press', 3]]),
  session(at(9, 9), [
    ['back-squat', 3],
    ['romanian-deadlift', 3],
    ['barbell-bench-press', 3],
    ['barbell-row', 3],
    ['overhead-press', 3],
    ['barbell-curl', 3],
    ['cable-triceps-pushdown', 3],
    ['lateral-raise', 3],
    ['ab-wheel-rollout', 3],
  ]),
];
const sitOut: MuscleId[] = [
  'quads',
  'glutes',
  'hamstrings',
  'chest',
  'triceps',
  'upper-back',
  'lats',
  'front-delts',
  'biceps',
  'side-delts',
  'abs',
];

const planFor = (spec: CatchUpSpec) =>
  generateWorkout({
    profile,
    location: home,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });

describe('a saved second workout loaded on another day', () => {
  it('built from its muscles, is a catch-up of them at the doses it had', () => {
    const spec: CatchUpSpec = {
      kind: 'second',
      muscles: [
        { muscle: 'forearms', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'traps', sets: 2, minRir: 3, why: 'remainder' },
      ],
      sitOut,
    };
    const workout = planFor(spec);
    expect(workout.templateId).toBe('second-workout');
    expect(workout.explanation.reasons.join(' / ')).toMatch(/trained today, sit out/);
    const copy = secondOnAnotherDay(spec, workout);
    expect(copy.spec).toEqual({
      kind: 'catch-up',
      muscles: [
        { muscle: 'forearms', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'traps', sets: 2, minRir: 3, why: 'behind' },
      ],
      sitOut: [],
    });
    expect(copy.workout.templateId).toBe('catch-up');
    expect(copy.workout.title).toBe('Catch-up');
    expect(copy.workout.explanation.summary).toMatch(/^Catch-up: /);
    const reasons = copy.workout.explanation.reasons;
    expect(reasons[0]).toMatch(/^A catch-up for what this week still lacks: /);
    expect(reasons.join(' / ')).not.toMatch(
      /trained today|A second workout today|what is left of one session/,
    );
    // Laid out as it was.
    expect(copy.workout.blocks).toEqual(workout.blocks);
  });

  it('laid out on the split’s day, as with nothing behind, is that day’s plan', () => {
    const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut };
    const workout = planFor(spec);
    const template = TEMPLATES.find((one) => one.id === workout.templateId);
    expect(template).toBeDefined();
    expect(workout.explanation.reasons.join(' / ')).toMatch(/trained today, sit out/);
    const copy = secondOnAnotherDay(spec, workout);
    expect(copy.spec).toBeNull();
    expect(copy.workout.templateId).toBe(workout.templateId);
    expect(copy.workout.title).toBe(template!.title);
    expect(copy.workout.explanation.reasons.join(' / ')).not.toMatch(/trained today/);
    expect(copy.workout.blocks).toEqual(workout.blocks);
    // Emptied, its title was the second workout's: the day's own again.
    const empty = secondOnAnotherDay(spec, {
      ...workout,
      title: 'Second workout',
      blocks: [],
    });
    expect(allEntries(empty.workout.blocks)).toHaveLength(0);
    expect(empty.workout.title).toBe(template!.title);
  });
});
