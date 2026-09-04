import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { tempoCue } from '../../features/workout/tempo';
import { TempoBar } from './TempoBar';

describe('TempoBar', () => {
  it('sizes segments by seconds, skips empty phases, and paces the sweep to one rep', () => {
    const tempo = tempoCue('primary-strength', 'working', requireExercise('barbell-bench-press'));
    const { container } = render(
      <TempoBar phases={tempo.phases} totalSeconds={tempo.totalSeconds} />,
    );
    const bar = screen.getByTestId('tempo-bar');
    expect(bar).toHaveAttribute(
      'aria-label',
      'One rep: lower 2 s, hold 1 s, lift as fast as you can',
    );
    const segments = container.querySelectorAll('[data-phase]');
    expect(segments).toHaveLength(3);
    expect((segments[0] as HTMLElement).style.flexGrow).toBe('2');
    expect((segments[2] as HTMLElement).style.flexGrow).toBe('1');
    expect(segments[2]).toHaveTextContent('fast');
    const sweep = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(sweep.style.animationDuration).toBe('4s');
  });
});
