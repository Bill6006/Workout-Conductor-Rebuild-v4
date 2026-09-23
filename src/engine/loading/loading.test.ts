import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import {
  DUMBBELLS_KEY,
  PLATES_KEY,
  LoadingSpecSchema,
  describeSpec,
  expandRanges,
  fitWeight,
  loadingFor,
  loadingKeyFor,
  nudge,
  snapDown,
  specFor,
  type LoadingMap,
  type LoadingRange,
} from './loading';

/** The owner's gym stack: tens to 100, then twenties to 280. */
const LEG_CURL_RANGES: LoadingRange[] = [
  { from: 10, to: 100, step: 10 },
  { from: 120, to: 280, step: 20 },
];
const STACK: LoadingMap = { 'leg-curl': { kind: 'stack', ranges: LEG_CURL_RANGES } };

/** The owner's home: adjustable dumbbells to 52.5. */
const HOME: LoadingMap = {
  [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 52.5, step: 2.5 }] },
  [PLATES_KEY]: { kind: 'plates', perSide: [45, 25, 10, 5] },
};

describe('available weights', () => {
  it('expands ranges into one ascending list and snaps down onto it', () => {
    const stack = expandRanges(LEG_CURL_RANGES);
    expect(stack.slice(0, 4)).toEqual([10, 20, 30, 40]);
    expect(stack.slice(-3)).toEqual([240, 260, 280]);
    expect(stack).toHaveLength(19);
    expect(snapDown(105, stack)).toBe(100);
    expect(snapDown(119, stack)).toBe(100);
    expect(snapDown(120, stack)).toBe(120);
    expect(snapDown(5, stack)).toBe(10);
    expect(snapDown(1000, stack)).toBe(280);
  });

  it('nudges to the next real weight, or by the step when any weight works', () => {
    const stack = expandRanges(LEG_CURL_RANGES);
    expect(nudge(100, 1, stack, 5)).toBe(120);
    expect(nudge(120, -1, stack, 5)).toBe(100);
    expect(nudge(280, 1, stack, 5)).toBe(280);
    expect(nudge(10, -1, stack, 5)).toBe(10);
    expect(nudge(105, 1, stack, 5)).toBe(120);
    expect(nudge(100, 1, null, 5)).toBe(105);
    expect(nudge(2, -1, null, 5)).toBe(0);
  });

  it('a stack exercise loads to its stack, with the heaviest weight as the cap', () => {
    const legCurl = requireExercise('leg-curl');
    const loading = loadingFor(STACK, undefined, legCurl, 'lb');
    expect(loading.cap).toBe(280);
    expect(loading.available?.[0]).toBe(10);
    expect(fitWeight(115, loading)).toBe(100);
    expect(fitWeight(125, loading)).toBe(120);
    // Without a spec any step works, and an off-grid weight lands on the step under it.
    const bare = loadingFor(undefined, undefined, legCurl, 'lb');
    expect(bare).toMatchObject({ available: null, cap: null, step: 10 });
    expect(fitWeight(115, bare)).toBe(110);
    expect(fitWeight(120, bare)).toBe(120);
  });

  it("dumbbell exercises share the place's set and are capped at its heaviest pair", () => {
    const press = requireExercise('dumbbell-bench-press');
    expect(loadingKeyFor(press)).toBe(DUMBBELLS_KEY);
    expect(specFor(HOME, press)?.kind).toBe('dumbbells');
    const loading = loadingFor(HOME, undefined, press, 'lb');
    expect(loading.cap).toBe(52.5);
    expect(fitWeight(54, loading)).toBe(52.5);
    expect(fitWeight(41, loading)).toBe(40);
    expect(loading.available?.[0]).toBe(5);
  });

  it('a bar takes the rack, and a plate missing today widens the step for the day only', () => {
    const bench = requireExercise('barbell-bench-press');
    expect(loadingKeyFor(bench)).toBe(PLATES_KEY);
    const usual = loadingFor(undefined, undefined, bench, 'lb');
    expect(usual).toMatchObject({ step: 5, cap: null, missingToday: [] });
    // Every total the standard plates make on the 45 bar: fives, from the empty bar.
    expect(usual.available?.slice(0, 4)).toEqual([45, 50, 55, 60]);
    expect(usual.perSide).toEqual([45, 35, 25, 10, 5, 2.5]);
    expect(fitWeight(120, usual, 45)).toBe(120);

    const today = loadingFor(undefined, { missingPlates: [2.5] }, bench, 'lb');
    expect(today.step).toBe(10);
    expect(today.perSide).toEqual([45, 35, 25, 10, 5]);
    expect(today.available?.slice(0, 4)).toEqual([45, 55, 65, 75]);
    expect(today.missingToday).toEqual([2.5]);
    // What the rack makes with the 2.5s back, so a line can say which plate changed a target.
    expect(today.usual).toContain(100);
    expect(today.available).not.toContain(100);
    // The dial moves between weights the plates make, from wherever it stands.
    expect(nudge(100, 1, today.available, today.step)).toBe(105);
    expect(nudge(100, -1, today.available, today.step)).toBe(95);
    // 120 cannot be made without a 2.5: the bar is 45, so totals go 55, 65 ... 115, 125.
    expect(fitWeight(120, today, 45)).toBe(115);
    expect(fitWeight(125, today, 45)).toBe(125);
    expect(fitWeight(50, today, 45)).toBe(45);

    const rack = loadingFor(HOME, undefined, bench, 'lb');
    expect(rack.perSide).toEqual([45, 25, 10, 5]);
    expect(rack.step).toBe(10);
  });

  it('a rack of odd plates loads exactly what they make, not a grid', () => {
    const bench = requireExercise('barbell-bench-press');
    const odd = loadingFor(
      { [PLATES_KEY]: { kind: 'plates', perSide: [45, 25] } },
      undefined,
      bench,
      'lb',
    );
    // 50 a side is two 25s, 45 a side one 45; 35 a side cannot be made.
    expect(odd.available?.slice(0, 6)).toEqual([45, 95, 135, 145, 185, 195]);
    expect(fitWeight(120, odd, 45)).toBe(95);
    expect(fitWeight(140, odd, 45)).toBe(135);
  });

  it('describes a spec in a line and refuses a broken one', () => {
    expect(describeSpec(STACK['leg-curl']!, 'lb')).toBe(
      'Stack: 10 to 100 by 10, then 120 to 280 by 20 lb',
    );
    expect(describeSpec(HOME[PLATES_KEY]!, 'lb')).toBe('Plates per side: 45, 25, 10, 5');
    expect(LoadingSpecSchema.safeParse({ kind: 'stack', ranges: [] }).success).toBe(false);
    expect(
      LoadingSpecSchema.safeParse({ kind: 'stack', ranges: [{ from: 10, to: 100, step: 0 }] })
        .success,
    ).toBe(false);
  });
});
