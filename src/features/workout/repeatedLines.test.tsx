import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { AdaptiveCoachCard } from '../../components/AdaptiveCoach/AdaptiveCoachCard';
import type { CoachCard } from '../../engine/coach/coachConductor';
import { coachingPolicy } from '../../engine/coach/experience';
import type { FatigueSignal } from '../../engine/recovery/fatigue';
import { Providers, createTestStore } from '../../test/testStore';
import { ExerciseDetailSheet } from '../../components/ExerciseDetail/ExerciseDetailSheet';
import { HowToSheet } from '../../components/ExerciseDetail/HowToSheet';

/**
 * Maintenance 25, the owner's item 39: a list drawn from text keyed each line by its text, so a
 * line said twice gave React two children with one key. Every such list keys its lines apart; the
 * coach's lines and a lift's evidence and cues (the lifter's own, which can repeat) show it here.
 */

/** React's warnings about two children under one key, from the console's error calls. */
function sameKeyWarnings(errors: { mock: { calls: unknown[][] } }) {
  return errors.mock.calls.filter((call) => String(call[0]).includes('same key'));
}

describe('a list that says one thing twice', () => {
  it('shows both of the coach’s lines, each under a key of its own', () => {
    const policy = coachingPolicy('beginner');
    const card: CoachCard = {
      policy,
      considered: 1,
      domains: ['rest'],
      signal: {
        domain: 'rest',
        headline: 'Rest 30 s longer before the next Barbell Bench Press set',
        why: [
          'Reps fell from 8 to 5 with nothing in reserve.',
          'Reps fell from 8 to 5 with nothing in reserve.',
        ],
        action: { kind: 'rest', deltaSeconds: 30, label: 'Add 30 s to this rest' },
        confidence: 'medium',
        severity: 2,
        source: 'in-session reps',
      },
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(
        <AdaptiveCoachCard
          card={card}
          fatigue={{ level: 'fresh', evidence: [] } as unknown as FatigueSignal}
          policy={policy}
          onAction={vi.fn()}
        />,
      );
      expect(screen.getAllByText('Reps fell from 8 to 5 with nothing in reserve.')).toHaveLength(2);
      expect(sameKeyWarnings(errors)).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it('shows every line of a lift’s evidence and cues, each under a key of its own', () => {
    // The target's reasons sit in Options and the lifter's own setup and cues in How to
    // (Maintenance 25, item 7); a line said twice is shown twice in each.
    const bench = requireExercise('barbell-bench-press');
    const twice = 'Held at the heaviest weight here (20 lb): the reps go up instead.';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { unmount } = render(
        <Providers store={createTestStore().store}>
          <ExerciseDetailSheet
            exercise={bench}
            onClose={() => undefined}
            targetNotes={{ lastTime: null, why: [twice, twice] }}
          />
        </Providers>,
      );
      expect(screen.getAllByText(twice)).toHaveLength(2);
      unmount();
      render(
        <Providers store={createTestStore().store}>
          <HowToSheet
            exercise={bench}
            onClose={() => undefined}
            own={{ setup: ['Feet flat.', 'Feet flat.'], execution: [], cues: ['Brace', 'Brace'] }}
          />
        </Providers>,
      );
      expect(screen.getAllByText('Brace')).toHaveLength(2);
      expect(screen.getAllByText('Feet flat.')).toHaveLength(2);
      expect(sameKeyWarnings(errors)).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it('shows a custom exercise’s repeated mistake twice, each under a key of its own', () => {
    // A custom exercise's stored lists can repeat a line (a restored backup, say).
    const bench = requireExercise('barbell-bench-press');
    const custom = {
      ...bench,
      instructions: {
        ...bench.instructions,
        mistakes: ['Bouncing the bar off the chest.', 'Bouncing the bar off the chest.'],
      },
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(
        <Providers store={createTestStore().store}>
          <ExerciseDetailSheet exercise={custom} onClose={() => undefined} />
        </Providers>,
      );
      expect(screen.getAllByText('Bouncing the bar off the chest.')).toHaveLength(2);
      expect(sameKeyWarnings(errors)).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });
});
