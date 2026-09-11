import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SetLogger } from './SetLogger';

const base = { units: 'lb' as const, mode: 'log' as const, weightStep: 5, onCommit: vi.fn() };

describe('SetLogger weight hint', () => {
  it('says what to load under the weight: the target, the warm-up load, bodyweight, or a prompt', () => {
    const { rerender } = render(
      <SetLogger
        {...base}
        target={{ kind: 'working', reps: [4, 6], rir: 2, weight: 155, label: 'Set 1 of 4' }}
        initial={{ weight: 155, reps: 6, rir: 2 }}
      />,
    );
    const logger = screen.getByTestId('set-logger');
    expect(logger).toHaveTextContent('Target 155 lb');
    expect(screen.getByRole('button', { name: 'Increase weight by 5 lb' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease weight by 5 lb' })).toBeInTheDocument();

    rerender(
      <SetLogger
        {...base}
        target={{ kind: 'warmup', reps: [4, 6], rir: 5, weight: 80, label: 'Ramp 1' }}
        initial={{ weight: 80, reps: 6, rir: 5 }}
      />,
    );
    expect(logger).toHaveTextContent('Warm-up 80 lb');
    expect(logger).not.toHaveTextContent('Step 5');

    rerender(
      <SetLogger
        {...base}
        target={{ kind: 'working', reps: [8, 12], rir: 1, weight: null, label: 'Set 1 of 3' }}
        initial={{ weight: null, reps: 12, rir: 1 }}
        weightHint="Bodyweight"
      />,
    );
    expect(logger).toHaveTextContent('Bodyweight');

    rerender(
      <SetLogger
        {...base}
        target={{ kind: 'working', reps: [8, 12], rir: 1, weight: null, label: 'Set 1 of 3' }}
        initial={{ weight: null, reps: 12, rir: 1 }}
      />,
    );
    expect(logger).toHaveTextContent('Enter a weight');
  });
});
