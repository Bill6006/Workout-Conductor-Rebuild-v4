import { describe, expect, it } from 'vitest';
import { bench, plan, run, shape } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, in the list of changes (the second review of round N): a
 * main lift coming back onto its top set and back-offs from straight sets names its top set's and
 * its back-offs' loads. Synthetic data only.
 */
describe('the list of changes when a main lift comes back onto its top set and back-offs, the second review of round N', () => {
  it('names the top set’s load (and the back-offs’) when the structure comes back on', () => {
    const workout = plan();
    // No 2.5 lb plates today: 190 cannot be made, so straight sets at 185, the reps pushed.
    const away = run({ type: 'loading' }, workout, { loading: { missingPlates: [2.5] } });
    expect(shape(bench(away.workout))).toEqual([
      [185, 2, 'straight'],
      [185, 2, 'straight'],
      [185, 2, 'straight'],
      [185, 2, 'straight'],
    ]);
    // The plates are back: the top set at 190 and three back-offs at 180.
    const back = run({ type: 'loading' }, away.workout, {
      loading: { missingPlates: [] },
      constraints: away.constraints,
    });
    expect(shape(bench(back.workout))).toEqual([
      [190, 1, 'top'],
      [180, 2, 'back-off'],
      [180, 2, 'back-off'],
      [180, 2, 'back-off'],
    ]);
    const line = back.changes.find((change) => change.entryId === bench(back.workout).id)?.detail;
    expect(line).toContain('top set 190');
    expect(line).toContain('back-offs 180');
  });
});
