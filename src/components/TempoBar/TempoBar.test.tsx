import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { tempoCue } from '../../features/workout/tempo';
import { TempoBar } from './TempoBar';
import { fillKeyframes, phaseWindows } from './tempoKeyframes';

describe('TempoBar', () => {
  it('moves the fill like the weight: down at the lowering pace, hold, up at the lifting pace, squeeze', () => {
    const strength = tempoCue(
      'primary-strength',
      'working',
      requireExercise('barbell-bench-press'),
    );
    // 2 s lower, 1 s hold, 1 s lift, no squeeze: total 4 s.
    expect(fillKeyframes(strength.phases)).toEqual([
      { width: '100%', offset: 0 },
      { width: '0%', offset: 0.5 },
      { width: '0%', offset: 0.75 },
      { width: '100%', offset: 1 },
      { width: '100%', offset: 1 },
    ]);
    expect(phaseWindows(strength.phases)).toEqual([
      { key: 'lower', start: 0, end: 0.5 },
      { key: 'hold', start: 0.5, end: 0.75 },
      { key: 'lift', start: 0.75, end: 1 },
    ]);
    const isolation = tempoCue('isolation', 'working', requireExercise('cable-fly'));
    // 2 s lower, 2 s lift, 1 s squeeze: the fill holds at the top for the last fifth.
    expect(fillKeyframes(isolation.phases)).toEqual([
      { width: '100%', offset: 0 },
      { width: '0%', offset: 0.4 },
      { width: '0%', offset: 0.4 },
      { width: '100%', offset: 0.8 },
      { width: '100%', offset: 1 },
    ]);
    expect(phaseWindows(isolation.phases).map((window) => window.key)).toEqual([
      'lower',
      'lift',
      'squeeze',
    ]);
  });

  it('renders the legend and edges and survives without the animation API', () => {
    const tempo = tempoCue('primary-strength', 'working', requireExercise('barbell-bench-press'));
    render(<TempoBar phases={tempo.phases} totalSeconds={tempo.totalSeconds} />);
    const bar = screen.getByTestId('tempo-bar');
    expect(bar).toHaveAttribute(
      'aria-label',
      'One rep: lower 2 s, hold 1 s, lift as fast as you can',
    );
    expect(screen.getByTestId('tempo-fill')).toBeInTheDocument();
    const phases = bar.querySelectorAll('[data-phase]');
    expect(phases).toHaveLength(3);
    expect(phases[2]).toHaveTextContent('Liftfast');
    expect(bar).toHaveTextContent('bottom');
    expect(bar).toHaveTextContent('top');
  });
});
