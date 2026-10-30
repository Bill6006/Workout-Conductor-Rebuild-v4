import { describe, expect, it } from 'vitest';
import { bench, plan, profileOf } from '../../test/backOffs';
import { WorkoutEntrySchema } from './workoutSchema';

/**
 * Maintenance 33, the third review: the two values the plan's entry stores for its layers, the sets
 * the day's floor holds as they were (`floored`) and the plan an ease kept when the lift stopped
 * (`stopped.record`), are optional and dropped alone when this copy cannot read them, never the lift
 * or what stopped it (CLAUDE.md: "a new stored field is optional, with `.catch(...)`"). Synthetic
 * data only.
 */

const entry = bench(plan(undefined, profileOf('hybrid')));

describe('the plan entry’s stored layers', () => {
  it('keeps a readable record of the floor, and drops an unreadable one alone', () => {
    const kept = WorkoutEntrySchema.parse({ ...entry, floored: [entry.sets[0]] });
    expect(kept.floored).toEqual([entry.sets[0]]);
    const damaged = WorkoutEntrySchema.parse({ ...entry, floored: [{ index: -1 }] });
    expect(damaged.floored).toBeUndefined();
    expect(damaged.sets).toEqual(entry.sets);
  });

  it('drops an unreadable record’s sets a stop kept alone, what stopped the lift kept', () => {
    const damaged = WorkoutEntrySchema.parse({
      ...entry,
      stopped: { owed: 2, why: 'swap', record: { sets: 'not sets' } },
    });
    expect(damaged.stopped?.owed).toBe(2);
    expect(damaged.stopped?.why).toBe('swap');
    expect(damaged.stopped?.record?.sets).toBeUndefined();
    const readable = WorkoutEntrySchema.parse({
      ...entry,
      stopped: { owed: 2, why: 'swap', record: { exerciseId: entry.exerciseId, sets: entry.sets } },
    });
    expect(readable.stopped?.record?.sets).toEqual(entry.sets);
  });
});
