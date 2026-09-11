import { describe, expect, it } from 'vitest';
import {
  MAX_PROMPT_SNOOZE_DAYS,
  convertWeight,
  emptyMaxes,
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
  it('turns a remembered set into a max the same way the progression engine does', () => {
    expect(maxFromSet(135, 8)).toBe(171);
    expect(maxFromSet(135, 8)).toBe(estimateOneRepMax(135, 8));
    // Reps past twelve add nothing: the formula stops being useful there.
    expect(maxFromSet(100, 20)).toBe(140);
    expect(convertWeight(100, 'kg', 'lb')).toBe(220.5);
    expect(convertWeight(220.5, 'lb', 'kg')).toBe(100);
    expect(convertWeight(100, 'lb', 'lb')).toBe(100);
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
