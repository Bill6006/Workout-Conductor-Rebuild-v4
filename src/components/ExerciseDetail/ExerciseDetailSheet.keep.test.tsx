import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { buildConflictContext } from '../../engine/conflicts/context';
import { TEST_NOW, Providers, createTestStore } from '../../test/testStore';
import { ExerciseDetailSheet, type SessionActions } from './ExerciseDetailSheet';

/** Maintenance 22: the keep-for-weeks switch never carries over to the next time the sheet opens. */

const [, gym] = createDefaultLocations({ gymAccess: true }, TEST_NOW);
const bench = requireExercise('barbell-bench-press');
const alternatives = rankAlternatives({
  current: bench,
  context: buildConflictContext(createDefaultProfile(TEST_NOW), gym),
  otherExercises: [],
  limit: 3,
});

function actions(onUseAlternative: SessionActions['onUseAlternative']): SessionActions {
  return {
    pinned: false,
    onPin: () => undefined,
    onBusy: () => undefined,
    onUncomfortable: () => undefined,
    onSkip: () => undefined,
    onPain: () => undefined,
    onUseAlternative,
    keepInPlaceOf: bench.name,
  };
}

describe('the keep-for-weeks switch', () => {
  it('is off again after the sheet closes, and a swap then is for today only', () => {
    const handle = createTestStore();
    const use = vi.fn();
    const sheet = (open: boolean) => (
      <Providers store={handle.store}>
        <ExerciseDetailSheet
          exercise={open ? bench : null}
          onClose={() => undefined}
          alternatives={alternatives}
          sessionActions={actions(use)}
        />
      </Providers>
    );
    const { rerender } = render(sheet(true));
    const keep = () => screen.getByRole('switch', { name: /Keep it for the next 4 weeks/ });
    fireEvent.click(keep());
    expect(keep().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/in place of Barbell Bench Press until then/)).toBeTruthy();
    rerender(sheet(false));
    rerender(sheet(true));
    expect(keep().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getAllByTestId('use-alternative')[0]!);
    expect(use).toHaveBeenCalledWith(expect.any(String), false);
  });
});

describe('the details after the third pass of item 50', () => {
  it('gives each exercise a demonstration of its own: a Play pressed on one moves no other', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    try {
      const handle = createTestStore();
      const sheet = (id: string) => (
        <Providers store={handle.store}>
          <ExerciseDetailSheet exercise={requireExercise(id)} onClose={() => undefined} />
        </Providers>
      );
      const { rerender } = render(sheet('band-pull-apart'));
      fireEvent.click(screen.getByTestId('demo-play'));
      expect(screen.getByTestId('exercise-demo').getAttribute('src')).toContain('-loop.svg');
      rerender(sheet('ab-wheel-rollout'));
      expect(screen.getByTestId('exercise-demo').getAttribute('src')).not.toContain('-loop');
      expect(screen.getByTestId('demo-play')).toHaveTextContent('Play');
    } finally {
      // @ts-expect-error jsdom has no matchMedia; this test defined it
      delete window.matchMedia;
    }
  });
});
