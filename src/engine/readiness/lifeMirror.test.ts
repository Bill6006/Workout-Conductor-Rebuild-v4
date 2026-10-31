import { describe, expect, it } from 'vitest';
import type { LifeMirrorBlock } from '../../core/cloud/lifeMirror';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import type { Readiness } from '../recalibration/types';
import { readCheckIn, worseWords } from './checkIn';
import { lifeMirrorPrefill, sleepFrom } from './lifeMirror';

/**
 * Item 48: what Life Mirror's check-in fills in on today's, and how its stress and mood are read.
 * Every time is a clock time on this device. Synthetic data only.
 */

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).toISOString();

describe('Life Mirror’s night on this app’s sleep scale', () => {
  it('follows the hours, a step off for a broken or rough night', () => {
    // Under 5 h, 5-6, 6-7, 7-8, over 8: Poor, Short, Okay, Good, Great.
    expect([1, 2, 3, 4, 5].map((hours) => sleepFrom(hours, 3))).toEqual([1, 2, 3, 4, 5]);
    expect(sleepFrom(4, 2)).toBe(3);
    expect(sleepFrom(4, 1)).toBe(3);
    expect(sleepFrom(1, 1)).toBe(1);
    expect(sleepFrom(4, 5)).toBe(4);
  });

  it('is the quality alone with the hours not asked, and none with neither', () => {
    expect(sleepFrom(undefined, 2)).toBe(2);
    expect(sleepFrom(undefined, undefined)).toBeUndefined();
  });
});

describe('what today’s check-ins fill in', () => {
  const morning: LifeMirrorBlock = {
    block: 'morning',
    at: at(2, 7, 40),
    readings: { energy: 3, mood: 3, stress: 2, sleepHours: 2, sleepQuality: 4, motivation: 4 },
  };
  const afternoon: LifeMirrorBlock = {
    block: 'afternoon',
    at: at(2, 13, 5),
    readings: { energy: 2, stress: 4 },
  };

  it('takes energy, stress and mood from the latest, the night and motivation from the morning', () => {
    expect(lifeMirrorPrefill([morning, afternoon])).toEqual({
      energy: { value: 2, at: at(2, 13, 5) },
      sleep: { value: 2, at: at(2, 7, 40) },
      motivation: { value: 4, at: at(2, 7, 40) },
      stress: { value: 4, at: at(2, 13, 5) },
      mood: { value: 3, at: at(2, 7, 40) },
    });
  });

  it('takes no night and no motivation without this morning’s check-in', () => {
    expect(
      lifeMirrorPrefill([{ ...afternoon, readings: { ...afternoon.readings, motivation: 5 } }]),
    ).toEqual({
      energy: { value: 2, at: at(2, 13, 5) },
      stress: { value: 4, at: at(2, 13, 5) },
    });
  });

  it('fills in nothing where nothing came', () => {
    expect(lifeMirrorPrefill([])).toBeNull();
    expect(lifeMirrorPrefill([{ block: 'evening', at: at(2, 20), readings: {} }])).toBeNull();
  });
});

describe('Life Mirror’s stress and mood in the check-in', () => {
  const NOW = at(30, 9);
  const usual: Readiness = {
    energy: 3,
    soreness: 2,
    sleep: 3,
    motivation: 3,
    jointDiscomfort: [],
    timePressure: false,
  };
  /** A saved check-in `days` before NOW, with Life Mirror's stress and mood. */
  const saved = (days: number, extra: Partial<Readiness>): WorkoutRecord => {
    const when = new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
    return {
      ...record(0, 'back-squat', [[5, 225, 2]]),
      id: `w-${days}`,
      startedAt: when,
      completedAt: when,
      readiness: { ...usual, ...extra },
    };
  };
  const weeks = (extra: Partial<Readiness>, count = 6) =>
    Array.from({ length: count }, (_, at) => saved(at * 3 + 2, extra));

  it('reads stress above the lifter’s own as worse, and mood under it', () => {
    const history = weeks({ stress: 2, mood: 3 });
    const read = readCheckIn({ ...usual, stress: 4, mood: 1 }, history, NOW);
    expect(read.worse).toEqual(['mood', 'stress']);
    expect(read.lowered).toBe(true);
    expect(worseWords(read)).toBe('mood under your usual, stress above it');
  });

  it('says stress alone above the lifter’s own', () => {
    const history = weeks({ stress: 2, mood: 3 });
    const read = readCheckIn({ ...usual, sleep: 1, stress: 4 }, history, NOW);
    expect(read.worse).toEqual(['sleep', 'stress']);
    expect(worseWords({ ...read, worse: ['stress'] })).toBe('stress above your usual');
  });

  it('reads neither without enough saved check-ins that have them: never against the scale', () => {
    // Six saved check-ins, two of them with Life Mirror's readings.
    const history = [...weeks({}, 4), saved(14, { stress: 2, mood: 3 }), saved(17, { stress: 2 })];
    const read = readCheckIn({ ...usual, stress: 5, mood: 1 }, history, NOW);
    expect(read.worse).toEqual([]);
    expect(read.lowered).toBe(false);
  });
});
