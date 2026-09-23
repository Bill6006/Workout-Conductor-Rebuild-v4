import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { analyzeStrategy } from '../strategy/strategy';
import { interpretFatigue } from '../recovery/fatigue';
import { recommendNextTarget } from './progression';
import { prescribe } from './roles';
import { hasNoLoad, loggedLoad } from './startingLoad';

/**
 * Maintenance 21, item 17: a lift done at bodyweight gets advice that works without weight. Short
 * of its floor twice, it keeps its target and is told to try fewer reps over more sets, never to
 * take 10% off; a 0 logged on it is the bodyweight; and a family estimate passes only between
 * lifts measured the same way.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const chinUp = requireExercise('chin-up');
const bench = requireExercise('barbell-bench-press');
const chinRx = prescribe(chinUp, 'secondary-hypertrophy', profile);

function chinUps(days: number[], sets: SetSpec[]) {
  return days.map((daysAgo) => record(daysAgo, 'chin-up', sets, [6, 12], 1));
}

function next(
  exercise = chinUp,
  history: ReturnType<typeof record>[] = [],
  role: 'secondary-hypertrophy' | 'primary-strength' = 'secondary-hypertrophy',
) {
  return recommendNextTarget({
    exercise,
    role,
    prescription: prescribe(exercise, role, profile),
    history,
    profile,
    now: RECORD_NOW,
  });
}

const SHORT: SetSpec[] = [
  [5, null, 1],
  [4, null, 1],
  [4, null, 0],
];

describe('a lift done at bodyweight that falls short', () => {
  it('keeps its target with fewer reps over more sets, and is never a deload', () => {
    expect(chinRx.reps).toEqual([6, 12]);
    const twice = next(chinUp, chinUps([6, 2], SHORT));
    expect(twice).toMatchObject({
      mode: 'maintain',
      weight: null,
      short: { sessions: 2, floor: 6 },
    });
    expect(twice.evidence).toContain(
      'Short of 6 reps twice in a row: try fewer reps over more sets.',
    );
    expect(twice.evidence.join(' ')).not.toMatch(/micro-deload|10%|15%/);
    const three = next(chinUp, chinUps([9, 6, 2], SHORT));
    expect(three.short).toEqual({ sessions: 3, floor: 6 });
    expect(three.evidence).toContain(
      'Short of 6 reps 3 sessions running: try fewer reps over more sets.',
    );
    // Once is not a trend: the same target, in words that fit a lift with no weight.
    const once = next(chinUp, chinUps([2], SHORT));
    expect(once.short).toBeUndefined();
    expect(once.evidence).toContain(
      'Missed the floor last time; one session is not a trend, so the same target again.',
    );
  });

  it('gives no fewer-reps advice when today asks a different range from the one missed', () => {
    // Missed 6 at 6-12, twice; today is a strength day at 3-6, where 5, 4, 4 already fits.
    const strengthDay = next(chinUp, chinUps([6, 2], SHORT), 'primary-strength');
    expect(prescribe(chinUp, 'primary-strength', profile).reps[0]).not.toBe(6);
    expect(strengthDay).toMatchObject({ mode: 'maintain', weight: null });
    expect(strengthDay.short).toBeUndefined();
    expect(strengthDay.evidence).toContain(
      'Last time was a different rep range: log what you do today and the target follows.',
    );
    expect(strengthDay.evidence.join(' ')).not.toMatch(/micro-deload|10%|fewer reps/);
  });

  it('counts the run against today’s floor, not a higher floor a session once had', () => {
    // Nine days ago the range was bumped to 7-13 and the lifter did 6, 6, 6: short of 7, but
    // not of 6. Two days ago, at 6-12, 5, 4, 4. Only one session was short of today's 6.
    const history = [
      record(
        9,
        'chin-up',
        [
          [6, null, 1],
          [6, null, 1],
          [6, null, 1],
        ],
        [7, 13],
        1,
      ),
      ...chinUps([2], SHORT),
    ];
    const target = next(chinUp, history);
    expect(target.short).toBeUndefined();
    expect(target.evidence).toContain(
      'Missed the floor last time; one session is not a trend, so the same target again.',
    );
    expect(target.evidence.join(' ')).not.toMatch(/twice in a row|fewer reps/);
  });

  it('says nothing was missed when today’s floor was reached and only a raised one was not', () => {
    // Two days ago the target was raised mid-session from 6-12 to 8-14; the lifter did 7, 7, 7.
    const raised = record(
      2,
      'chin-up',
      [
        [7, null, 1],
        [7, null, 1],
        [7, null, 1],
      ],
      [6, 12],
      1,
    );
    for (const set of raised.entries[0]!.sets.slice(1)) set.targetReps = [8, 14];
    const target = next(chinUp, [raised]);
    expect(target).toMatchObject({ mode: 'maintain', weight: null });
    expect(target.short).toBeUndefined();
    expect(target.evidence.join(' ')).not.toMatch(/Missed the floor|Short of/);
    expect(target.evidence).toContain('Bodyweight inside the range: keep building reps.');
  });

  it('reads a 0 logged on it as the bodyweight, not a load to take 10% off', () => {
    expect(loggedLoad(chinUp, 0)).toBeNull();
    expect(loggedLoad(chinUp, 20)).toBe(20);
    expect(loggedLoad(bench, 0)).toBe(0);
    const zeros: SetSpec[] = [
      [5, 0, 1],
      [4, 0, 1],
    ];
    const target = next(chinUp, chinUps([6, 2], zeros));
    expect(target).toMatchObject({ mode: 'maintain', weight: null });
    expect(target.evidence[0]).toMatch(/^Last: bodyweight × 5, 4/);
  });

  it('still takes 10% off a loaded lift that falls short twice', () => {
    const benchShort = [6, 2].map((daysAgo) =>
      record(daysAgo, 'barbell-bench-press', [
        [3, 185, 1],
        [3, 185, 0],
      ]),
    );
    // The bench history sits at 4-6 reps, the strength range.
    const target = next(bench, benchShort, 'primary-strength');
    expect(target.mode).toBe('deload');
    expect(target.weight).toBeLessThan(185);
    expect(target.short).toBeUndefined();
  });

  it('asks for no weight the first time, and a stack still asks for one', () => {
    expect(next(chinUp).evidence).toEqual([
      'First time logged: log what you do and the next target follows from it.',
    ]);
    // One test for "no weight": no load reference. Bench Dip and Step-Up list only a bench.
    const benchDip = requireExercise('bench-dip');
    const stepUp = requireExercise('step-up');
    expect([chinUp, benchDip, stepUp].every(hasNoLoad)).toBe(true);
    expect(hasNoLoad(bench)).toBe(false);
    expect(loggedLoad(benchDip, 0)).toBeNull();
    expect(next(benchDip).evidence).toEqual([
      'First time logged: log what you do and the next target follows from it.',
    ]);
    const fly = requireExercise('cable-fly');
    const flyTarget = recommendNextTarget({
      exercise: fly,
      role: 'isolation',
      prescription: prescribe(fly, 'isolation', profile),
      history: [],
      profile: createDefaultProfile(RECORD_NOW),
    });
    expect(flyTarget.evidence[0]).toMatch(/enter the weight you use/);
  });
});

describe('a family estimate passes only between lifts measured the same way', () => {
  const benchHistory = [9, 5, 2].map((daysAgo) =>
    record(daysAgo, 'barbell-bench-press', [
      [5, 185, 2],
      [5, 185, 2],
    ]),
  );

  it('gives a push-up no weight from a bench press', () => {
    const pushUp = next(requireExercise('push-up'), benchHistory);
    expect(pushUp.weight).toBeNull();
    expect(pushUp.evidence).toEqual([
      'New variation: log what you do and the next target follows from it.',
    ]);
  });

  it('starts a lat pulldown from the lifter, not from a chin-up’s added weight', () => {
    const pulldown = requireExercise('lat-pulldown');
    const afterBodyweight = next(pulldown, chinUps([6, 2], SHORT));
    const fresh = next(pulldown, []);
    expect(afterBodyweight.weight).not.toBeNull();
    expect(afterBodyweight.weight).toBe(fresh.weight);
    const weighted = chinUps(
      [6, 2],
      [
        [6, 20, 2],
        [6, 20, 2],
      ],
    );
    const afterWeighted = next(pulldown, weighted);
    expect(afterWeighted.weight).toBe(fresh.weight);
    expect(afterWeighted.weight).toBeGreaterThan(40);
    // Two lifts done at bodyweight still share their added weight.
    const pullUp = next(requireExercise('pull-up'), weighted);
    expect(pullUp.mode).toBe('estimate');
    expect(pullUp.weight).not.toBeNull();
  });
});

describe('the history notes about a lift done at bodyweight', () => {
  it('never tell it to add 5 lb or take 10% off, and still do for a loaded lift', () => {
    const history = chinUps([9, 6, 2], SHORT);
    const fatigue = interpretFatigue(history, RECORD_NOW, null);
    const notes = analyzeStrategy({ history, profile, now: RECORD_NOW, fatigue });
    expect(
      notes.filter(
        (note) =>
          note.exerciseId === 'chin-up' &&
          (note.recommendation === 'micro-deload' || note.recommendation === 'add-weight'),
      ),
    ).toEqual([]);
    const benchShort = [9, 6, 2].map((daysAgo) =>
      record(daysAgo, 'barbell-bench-press', [
        [3, 185, 1],
        [3, 185, 0],
      ]),
    );
    const benchNotes = analyzeStrategy({
      history: benchShort,
      profile,
      now: RECORD_NOW,
      fatigue: interpretFatigue(benchShort, RECORD_NOW, null),
    });
    expect(benchNotes.some((note) => note.recommendation === 'micro-deload')).toBe(true);
  });
});
