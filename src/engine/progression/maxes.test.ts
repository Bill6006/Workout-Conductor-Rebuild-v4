import { describe, expect, it } from 'vitest';
import {
  MAX_PROMPT_SNOOZE_DAYS,
  convertWeight,
  emptyMaxes,
  enteredE1rm,
  enteredMaxFor,
  maxFromSet,
  maxPromptHidden,
  parseStrengthMaxes,
  recordMax,
  snoozeMaxPrompt,
} from './maxes';
import { estimateOneRepMax } from './progression';

const NOW = '2026-09-10T12:00:00.000Z';

describe('entered maxes', () => {
  it('turns a remembered set into a max with Epley, every rep counted up to thirty', () => {
    expect(maxFromSet(135, 8)).toBe(171);
    expect(maxFromSet(135, 8)).toBe(estimateOneRepMax(135, 8));
    // Maintenance 25, the owner's item 36: a set of 20 or 25 is not a set of 12. Reps count up to
    // thirty, as far as a light set run to its reserve is asked for (docs/research/entered-maxes.md).
    expect(maxFromSet(100, 20)).toBe(166.7);
    expect(maxFromSet(20, 25)).toBe(36.7);
    expect(maxFromSet(100, 30)).toBe(200);
    expect(maxFromSet(100, 45)).toBe(200);
    expect(maxFromSet(20, 20)).not.toBe(maxFromSet(20, 15));
    expect(convertWeight(100, 'kg', 'lb')).toBe(220.5);
    expect(convertWeight(220.5, 'lb', 'kg')).toBe(100);
    expect(convertWeight(100, 'lb', 'lb')).toBe(100);
  });

  it('reads a set entered before Maintenance 25 by today’s rule, and a typed max as typed', () => {
    // Saved with the old cap: 20 lb for 20 reps was stored as 28.
    const saved = parseStrengthMaxes({
      maxes: {
        'incline-dumbbell-press': {
          e1rm: 28,
          units: 'lb',
          enteredAt: NOW,
          from: { weight: 20, reps: 20 },
        },
        'barbell-bench-press': { e1rm: 225, units: 'lb', enteredAt: NOW, from: null },
      },
    });
    expect(enteredMaxFor(saved, 'incline-dumbbell-press', 'lb')).toBe(33.3);
    expect(enteredE1rm(saved.maxes['incline-dumbbell-press']!)).toBe(33.3);
    expect(enteredMaxFor(saved, 'barbell-bench-press', 'lb')).toBe(225);
  });

  it('records a max from a set or a number, in the units of the day, and reads it back in any units', () => {
    const fromSet = recordMax(
      emptyMaxes(),
      'barbell-bench-press',
      { kind: 'set', weight: 135, reps: 8 },
      'lb',
      NOW,
    );
    expect(fromSet.maxes['barbell-bench-press']).toEqual({
      e1rm: 171,
      units: 'lb',
      enteredAt: NOW,
      from: { weight: 135, reps: 8 },
    });
    const fromMax = recordMax(fromSet, 'back-squat', { kind: 'max', e1rm: 100 }, 'kg', NOW);
    expect(fromMax.maxes['back-squat']).toMatchObject({ e1rm: 100, units: 'kg', from: null });
    expect(enteredMaxFor(fromMax, 'back-squat', 'lb')).toBe(220.5);
    expect(enteredMaxFor(fromMax, 'back-squat', 'kg')).toBe(100);
    expect(enteredMaxFor(fromMax, 'deadlift', 'lb')).toBeNull();
    expect(() => recordMax(emptyMaxes(), 'deadlift', { kind: 'max', e1rm: 0 }, 'lb', NOW)).toThrow(
      /above zero/,
    );
  });

  it('hides the offer for a week on "Not now", for good on "Don\'t ask", and always once a max exists', () => {
    const snoozed = snoozeMaxPrompt(emptyMaxes(), 'deadlift', NOW, false);
    expect(maxPromptHidden(snoozed, 'deadlift', NOW)).toBe(true);
    const later = new Date(
      Date.parse(NOW) + (MAX_PROMPT_SNOOZE_DAYS + 1) * 86_400_000,
    ).toISOString();
    expect(maxPromptHidden(snoozed, 'deadlift', later)).toBe(false);
    expect(maxPromptHidden(snoozed, 'back-squat', NOW)).toBe(false);

    const never = snoozeMaxPrompt(emptyMaxes(), 'deadlift', NOW, true);
    expect(maxPromptHidden(never, 'deadlift', later)).toBe(true);

    const entered = recordMax(never, 'deadlift', { kind: 'max', e1rm: 300 }, 'lb', later);
    expect(entered.prompts.deadlift).toBeUndefined();
    expect(maxPromptHidden(entered, 'deadlift', later)).toBe(true);
  });

  it('parses a stored record tolerantly', () => {
    expect(parseStrengthMaxes(null)).toEqual(emptyMaxes());
    expect(parseStrengthMaxes('junk')).toEqual(emptyMaxes());
    const parsed = parseStrengthMaxes({
      id: 'strength-maxes',
      maxes: {
        good: { e1rm: 150, units: 'lb', enteredAt: NOW, from: { weight: 120, reps: 8 } },
        bad: { e1rm: 'heavy', units: 'lb', enteredAt: NOW },
        wrongUnits: { e1rm: 150, units: 'stone', enteredAt: NOW },
      },
      prompts: { snoozed: { until: NOW }, never: { until: null }, broken: { until: 5 } },
    });
    expect(Object.keys(parsed.maxes)).toEqual(['good']);
    expect(parsed.maxes.good?.from).toEqual({ weight: 120, reps: 8 });
    expect(parsed.prompts).toEqual({ snoozed: { until: NOW }, never: { until: null } });
  });
});

describe('a saved recent set that says nothing (Maintenance 25)', () => {
  it('leaves the saved max standing: no weight or no reps is no set', () => {
    for (const from of [
      { weight: 0, reps: 20 },
      { weight: -50, reps: 5 },
      { weight: 100, reps: 0 },
      { weight: Number.NaN, reps: 8 },
    ]) {
      const maxes = parseStrengthMaxes({
        maxes: {
          'barbell-bench-press': {
            e1rm: 225,
            units: 'lb',
            enteredAt: '2026-09-01T00:00:00.000Z',
            from,
          },
        },
      });
      expect(maxes.maxes['barbell-bench-press']?.from).toBeNull();
      expect(enteredMaxFor(maxes, 'barbell-bench-press', 'lb')).toBe(225);
    }
  });
});
