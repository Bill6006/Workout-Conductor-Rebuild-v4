import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import type { Readiness } from '../recalibration/types';
import { illnessOf, readCheckIn, worseWords } from './checkIn';

/**
 * Maintenance 33, the owner's decision 1 (docs/research/readiness-and-soreness.md): the check-in's
 * energy, sleep and motivation against the lifter's own baseline act only when two or more are
 * clearly worse, or one is extreme (two short nights running), and then lower what the app expects;
 * soreness never counts. Synthetic data only.
 */

const checkIn = (energy: number, sleep: number, motivation: number, soreness = 2): Readiness => ({
  energy,
  sleep,
  motivation,
  soreness,
  jointDiscomfort: [],
  timePressure: false,
});

/** A saved session `daysAgo` with a check-in on it. */
const saved = (daysAgo: number, readiness: Readiness): WorkoutRecord => ({
  ...record(daysAgo, 'barbell-row', [[6, 135, 2]]),
  id: `checked-${daysAgo}`,
  readiness: { ...readiness },
});

describe('without five saved check-ins: the scale’s middle', () => {
  it('two items at 2 or under lower the expectation', () => {
    const read = readCheckIn(checkIn(2, 2, 3), [], RECORD_NOW);
    expect(read).toMatchObject({ worse: ['energy', 'sleep'], lowered: true, baseline: 'scale' });
    expect(worseWords(read)).toBe('energy and sleep low');
  });

  it('one alone does not', () => {
    const read = readCheckIn(checkIn(1, 3, 3), [], RECORD_NOW);
    expect(read.worse).toEqual(['energy']);
    expect(read.lowered).toBe(false);
  });

  it('soreness never counts, at its worst a line of its own', () => {
    const read = readCheckIn(checkIn(3, 3, 3, 5), [], RECORD_NOW);
    expect(read.worse).toEqual([]);
    expect(read.lowered).toBe(false);
    expect(read.wrecked).toBe(true);
    expect(readCheckIn(checkIn(3, 3, 3, 4), [], RECORD_NOW).wrecked).toBe(false);
  });
});

describe('against the lifter’s own four weeks', () => {
  /** Five check-ins this past fortnight: energy 4 and 5, sleep always 4, motivation 4. */
  const usual = [1, 3, 5, 8, 10].map((days, at) => saved(days, checkIn(at % 2 ? 5 : 4, 4, 4)));

  it('a point under a steady item is clearly worse; two of them lower it', () => {
    const read = readCheckIn(checkIn(4, 3, 3), usual, RECORD_NOW);
    // Sleep and motivation never moved: a point under them is clearly worse; energy 4 is usual.
    expect(read).toMatchObject({ worse: ['sleep', 'motivation'], lowered: true, baseline: 'own' });
    expect(worseWords(read)).toBe('sleep and motivation under your usual');
  });

  it('the same answers from a lifter who usually reports them are nothing', () => {
    const low = [1, 3, 5, 8, 10].map((days) => saved(days, checkIn(2, 2, 3)));
    const read = readCheckIn(checkIn(2, 2, 3), low, RECORD_NOW);
    expect(read.worse).toEqual([]);
    expect(read.lowered).toBe(false);
  });

  it('check-ins over four weeks old, or from today, are no part of the baseline', () => {
    const old = [30, 32, 35, 40, 45].map((days) => saved(days, checkIn(2, 2, 2)));
    expect(readCheckIn(checkIn(2, 2, 3), old, RECORD_NOW).baseline).toBe('scale');
    const today = [0, 0.1, 0.2, 0.3, 0.4].map((days) => saved(days, checkIn(5, 5, 5)));
    expect(readCheckIn(checkIn(2, 2, 3), today, RECORD_NOW).baseline).toBe('scale');
  });
});

describe('the extreme: two short nights running', () => {
  it('sleep at its worst today and on the check-in the day before', () => {
    const read = readCheckIn(checkIn(3, 1, 3), [saved(1, checkIn(3, 1, 3))], RECORD_NOW);
    expect(read.extreme).toBe('two short nights running');
    expect(read.lowered).toBe(true);
    expect(worseWords(read)).toBe('two short nights running');
  });

  it('one short night is not', () => {
    const read = readCheckIn(checkIn(3, 1, 3), [saved(1, checkIn(3, 3, 3))], RECORD_NOW);
    expect(read.extreme).toBeNull();
    expect(read.lowered).toBe(false);
  });
});

describe('the illness answer', () => {
  it('reads a known answer, and nothing else', () => {
    expect(illnessOf({ ...checkIn(3, 3, 3), illness: 'head' })).toBe('head');
    expect(illnessOf({ ...checkIn(3, 3, 3), illness: 'body' })).toBe('body');
    expect(illnessOf({ illness: 'flu' })).toBeNull();
    expect(illnessOf(checkIn(3, 3, 3))).toBeNull();
    expect(readCheckIn({ ...checkIn(3, 3, 3), illness: 'head' }, [], RECORD_NOW).illness).toBe(
      'head',
    );
  });
});
