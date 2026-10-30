import { describe, expect, it } from 'vitest';
import { record } from '../../test/records';
import { BENCH, profileOf } from '../../test/backOffs';
import { simulate } from '../../test/backOffsSim';

/**
 * The fifth review of round N. Hybrid to Undulating: the bench press's first heavy day (4-6) reads
 * its target from its last session at that range, the last top set on the structure, through the
 * moderate and light days between (other ranges). `mainLiftTarget` checks only the lift's last
 * session (`ranOnTopSet`), a light day, so `straightAfterTop` never runs: the top set, lifted as
 * asked at 1 in reserve, is read as straight sets at 2. Every set is asked the top set's load,
 * 4 x 200 at 2 in reserve, and "Hit the reps with little in reserve: hold the load": the third
 * review's HIGH, by another road. The spec: a straight day after a session on the structure takes
 * the back-offs' load, reading the session its target is read from. Synthetic data only.
 */

describe('the first heavy day after Hybrid turns Undulating', () => {
  it('takes the back-offs’ load, never the top set’s at a straight set’s reserve', () => {
    const seed = {
      ...record(0, BENCH, [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
      id: 'seed',
      startedAt: '2026-09-04T12:00:00.000Z',
      completedAt: '2026-09-04T12:00:00.000Z',
    };
    const days = [0, 1, 3, 4, 7, 8, 10, 11, 14, 15, 17, 18, 21];
    const { seen } = simulate({
      profile: profileOf('hybrid'),
      // Two weeks of Hybrid (the bench press on top set plus back-offs), then Undulating.
      profileFor: (day) => profileOf(day < 14 ? 'hybrid' : 'undulating'),
      history: [seed],
      start: '2026-09-07T12:00:00.000Z',
      days,
      exerciseId: BENCH,
    });
    const lastTop = [...seen].reverse().find((one) => one.sets[0]!.startsWith('top'))!;
    const topLoad = Number(lastTop.sets[0]!.split(' ')[1]!.split('x')[0]);
    const heavy = seen.find((one) => one.day >= 14 && one.sets[0]!.includes('x4-6@'))!;
    expect(heavy).toBeDefined();
    const line = heavy.evidence.join(' / ');
    // On 7f23a26: 'straight 200x4-6@2' on every set, the last top set's 200 x 5 at 1.
    expect(heavy.sets[0], line).not.toBe(`straight ${topLoad}x4-6@2`);
    expect(line).not.toContain('little in reserve');
  });
});
