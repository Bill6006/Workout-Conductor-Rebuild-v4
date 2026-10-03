import { describe, expect, it } from 'vitest';
import { liveWeightOn } from './liveWeight';

/**
 * Maintenance 25, item 8: the plates follow the dial in front of the lifter. A new target remounts
 * the logger, which says its own value only once it has been drawn: the dial turned for the target
 * before must not be drawn meanwhile.
 */

describe('the weight a dial was turned to', () => {
  it('is drawn on its own dial only: a new target never shows a dial turned before it', () => {
    const turned = { dial: 'log-bench-1-160', weight: 165 };
    expect(liveWeightOn(turned, 'log-bench-1-160')).toBe(165);
    expect(liveWeightOn(turned, 'log-bench-1-155')).toBeNull();
    expect(liveWeightOn(turned, null)).toBeNull();
    expect(liveWeightOn(undefined, 'log-bench-1-160')).toBeNull();
  });
});
