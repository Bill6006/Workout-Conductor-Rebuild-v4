import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetLogger } from './SetLogger';

const target = {
  kind: 'working' as const,
  reps: [4, 6] as [number, number],
  rir: 2,
  weight: 145,
  label: 'Set 2 of 4',
};

/** The owner's gym stack: tens to 100, then twenties to 280. */
const STACK = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200];

describe('the dial and what the place can load', () => {
  it('nudges through the real weights and names the nearest one when the target is not on the stack', async () => {
    const user = userEvent.setup();
    render(
      <SetLogger
        units="lb"
        target={{ ...target, weight: 110 }}
        initial={{ weight: 100, reps: 6, rir: 2 }}
        mode="log"
        weightStep={10}
        available={STACK}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('weight-hint')).toHaveTextContent('Target 110 lb · nearest 100');
    await user.click(screen.getByRole('button', { name: /^Increase weight/ }));
    expect(screen.getByTestId('logger-weight')).toHaveTextContent('120');
    await user.click(screen.getByRole('button', { name: /^Decrease weight/ }));
    await user.click(screen.getByRole('button', { name: /^Decrease weight/ }));
    expect(screen.getByTestId('logger-weight')).toHaveTextContent('90');
  });

  it('pulses the target line while the untouched dial sits below it, and stops once the dial moves', async () => {
    const user = userEvent.setup();
    render(
      <SetLogger
        units="lb"
        target={target}
        initial={{ weight: 140, reps: 6, rir: 2 }}
        mode="log"
        weightStep={5}
        onCommit={vi.fn()}
      />,
    );
    const hint = screen.getByTestId('weight-hint');
    expect(hint).toHaveAttribute('data-pulse', 'true');
    await user.click(screen.getByRole('button', { name: /^Increase weight/ }));
    expect(hint).not.toHaveAttribute('data-pulse');
  });

  it('does not pulse when the dial already meets the target, on a warm-up, or when editing', () => {
    const { unmount } = render(
      <SetLogger
        units="lb"
        target={target}
        initial={{ weight: 145, reps: 6, rir: 2 }}
        mode="log"
        weightStep={5}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('weight-hint')).not.toHaveAttribute('data-pulse');
    unmount();
    render(
      <SetLogger
        units="lb"
        target={{ ...target, kind: 'warmup', label: 'Ramp 1 of 2', weight: 80 }}
        initial={{ weight: 60, reps: 6, rir: 5 }}
        mode="log"
        weightStep={5}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('weight-hint')).not.toHaveAttribute('data-pulse');
  });

  it('the target line is a quiet way into Plates when asked', async () => {
    const user = userEvent.setup();
    const onWeightHintTap = vi.fn();
    render(
      <SetLogger
        units="lb"
        target={target}
        initial={{ weight: 145, reps: 6, rir: 2 }}
        mode="log"
        weightStep={5}
        onCommit={vi.fn()}
        onWeightHintTap={onWeightHintTap}
      />,
    );
    await user.click(screen.getByTestId('weight-hint'));
    expect(onWeightHintTap).toHaveBeenCalledTimes(1);
  });
});
