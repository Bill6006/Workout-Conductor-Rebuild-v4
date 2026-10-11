import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DONE_BUZZ_MS, RestBuzz, TICK_BUZZ_MS, buzzPlan, type Vibrator } from './restBuzz';

/**
 * Maintenance 29, the owner's item 7: "Vibration alongside the rest sounds, one switch for both".
 * A short buzz with each tick at three, two and one, a double buzz with the end tone.
 */
describe('the buzzes beside the rest sounds', () => {
  it('buzz with each tick and the end, a second apart, from the first still ahead', () => {
    expect(buzzPlan(10)).toEqual({
      startIn: 7,
      pattern: [60, 940, 60, 940, 60, 940, 120, 60, 120],
    });
    // Two and a half seconds left: the ticks at two and one, then the end.
    expect(buzzPlan(2.5)).toEqual({ startIn: 0.5, pattern: [60, 940, 60, 940, 120, 60, 120] });
    // Under a second left: only the end.
    expect(buzzPlan(0.4)).toEqual({ startIn: 0.4, pattern: [...DONE_BUZZ_MS] });
    expect(buzzPlan(0)).toBeNull();
    expect(TICK_BUZZ_MS).toBeLessThan(DONE_BUZZ_MS[0]!);
  });

  describe('laid and cancelled with the rest', () => {
    let calls: (number | number[])[];
    let buzz: RestBuzz;
    beforeEach(() => {
      vi.useFakeTimers();
      calls = [];
      const vibrator: Vibrator = {
        vibrate: (pattern) => {
          calls.push(pattern);
          return true;
        },
      };
      buzz = new RestBuzz(() => vibrator);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts the pattern on the first tick, once for each end', () => {
      buzz.schedule('end-1', 3.6);
      buzz.schedule('end-1', 3.5);
      vi.advanceTimersByTime(500);
      expect(calls).toEqual([]);
      vi.advanceTimersByTime(200);
      expect(calls).toEqual([[60, 940, 60, 940, 60, 940, 120, 60, 120]]);
    });

    it('lays nothing once cancelled, and stops a pattern already buzzing', () => {
      buzz.schedule('end-1', 3.6);
      buzz.cancel();
      vi.advanceTimersByTime(5000);
      expect(calls).toEqual([]);
      buzz.schedule('end-2', 3.6);
      vi.advanceTimersByTime(1000);
      buzz.cancel();
      expect(calls).toEqual([[60, 940, 60, 940, 60, 940, 120, 60, 120], 0]);
    });

    it('does nothing where the phone cannot buzz', () => {
      const none = new RestBuzz(() => null);
      none.schedule('end-1', 2);
      vi.advanceTimersByTime(3000);
      none.cancel();
      const refusing = new RestBuzz(() => ({
        vibrate: () => {
          throw new Error('not allowed');
        },
      }));
      refusing.schedule('end-1', 2);
      expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
    });
  });
});
