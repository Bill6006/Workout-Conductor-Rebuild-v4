import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { recommendNextTarget } from './progression';
import { prescribe } from './roles';

/**
 * Maintenance 25, the owner's item 39, found again by its review in a lift's own "Why this
 * target": the empty bar was named once for every step that met it, and a step it cancelled still
 * said it moved the load. Each line says what happened, once.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const curl = requireExercise('ez-bar-curl');

/** Four sessions at the 25 lb bar though 30 lb was asked, every set at the bottom of its range. */
function atTheBar(): WorkoutRecord[] {
  return [16, 12, 8, 4].map((daysAgo) => {
    const done = record(
      daysAgo,
      'ez-bar-curl',
      [
        [8, 25, 1],
        [8, 25, 1],
        [8, 25, 1],
      ],
      [8, 12],
      1,
    );
    for (const set of done.entries[0]?.sets ?? []) set.targetWeight = 30;
    return done;
  });
}

describe('a lift held at the empty bar', () => {
  it('names the bar once, and claims no step the bar cancelled', () => {
    const target = recommendNextTarget({
      exercise: curl,
      role: 'isolation',
      prescription: prescribe(curl, 'isolation', profile),
      history: atTheBar(),
      profile,
      now: RECORD_NOW,
      session: { precedingSets: 6 },
    });
    expect(target.weight).toBe(25);
    // The habit of lifting less and the work before it today both step down, and the bar cancels
    // both: neither step is claimed, and the bar is named once at most (here never: nothing held).
    const bar = target.evidence.filter((line) => line.startsWith('Never below the empty bar'));
    expect(bar.length).toBeLessThanOrEqual(1);
    expect(target.evidence).toContain('Inside the range: same load, one more rep per set.');
    expect(
      target.evidence.filter(
        (line) => target.evidence.indexOf(line) !== target.evidence.lastIndexOf(line),
      ),
    ).toEqual([]);
    // Held at the bar, the load moved nowhere: no line says it stepped down.
    expect(target.evidence.join(' ')).not.toMatch(/steps? down|down (a|two|\d+) steps?/);
  });
});

describe('a step the empty bar cuts short', () => {
  it('says the step the load took, and names the bar once', () => {
    const history = [16, 12, 8, 4].map((daysAgo) =>
      record(
        daysAgo,
        'ez-bar-curl',
        [
          [8, 30, 1],
          [8, 30, 1],
          [8, 30, 1],
        ],
        [8, 12],
        1,
      ),
    );
    const target = recommendNextTarget({
      exercise: curl,
      role: 'isolation',
      prescription: prescribe(curl, 'isolation', profile),
      history,
      profile,
      now: RECORD_NOW,
      session: { precedingSets: 6 },
    });
    // Two steps down from 30 would be 20; the 25 lb bar stops it after one.
    expect(target.weight).toBe(25);
    const steps = target.evidence.filter((line) => line.startsWith('Before this today: '));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatch(/: down a step\.$/);
    expect(target.evidence.filter((line) => line.startsWith('Never below the empty bar'))).toEqual([
      'Never below the empty bar (25 lb).',
    ]);
    expect(target.nudged).toBe(-1);
  });

  it('names the bar once when a lift logged under it is stepped up and then down again', () => {
    const press = requireExercise('overhead-press');
    const history = [16, 12, 8, 4].map((daysAgo) => {
      const done = record(
        daysAgo,
        'overhead-press',
        [
          [8, 35, 2],
          [8, 35, 2],
          [8, 35, 2],
        ],
        [6, 10],
        2,
      );
      // The lifter lifted above the load asked each time: the target steps up to meet them.
      for (const set of done.entries[0]?.sets ?? []) set.targetWeight = 30;
      return done;
    });
    const target = recommendNextTarget({
      exercise: press,
      role: 'secondary-hypertrophy',
      prescription: prescribe(press, 'secondary-hypertrophy', profile),
      history,
      profile,
      now: RECORD_NOW,
      session: { precedingSets: 6 },
    });
    expect(target.weight).toBe(45);
    expect(target.evidence.filter((line) => line.startsWith('Never below the empty bar'))).toEqual([
      'Never below the empty bar (45 lb).',
    ]);
    expect(
      target.evidence.filter(
        (line) => target.evidence.indexOf(line) !== target.evidence.lastIndexOf(line),
      ),
    ).toEqual([]);
  });
});
