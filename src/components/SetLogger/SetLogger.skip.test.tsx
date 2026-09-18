import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetLogger } from './SetLogger';

const working = {
  kind: 'working' as const,
  reps: [4, 6] as [number, number],
  rir: 2,
  weight: null,
  label: 'Set 2 of 4',
};

/** Zero reps is a skip; the button says so before the tap rather than after it. */
describe('the log button at zero reps', () => {
  it('reads Skip set once the reps reach zero, and Log set again above it', async () => {
    const user = userEvent.setup();
    render(
      <SetLogger
        units="lb"
        target={working}
        initial={{ weight: 100, reps: 1, rir: 2 }}
        mode="log"
        weightStep={5}
        onCommit={vi.fn()}
      />,
    );
    const button = screen.getByTestId('log-set');
    expect(button).toHaveTextContent('Log set');
    expect(button).toHaveAttribute('data-intent', 'log');
    await user.click(screen.getByRole('button', { name: 'Decrease reps' }));
    expect(button).toHaveTextContent('Skip set');
    expect(button).toHaveAttribute('data-intent', 'skip');
    await user.click(screen.getByRole('button', { name: 'Increase reps' }));
    expect(button).toHaveTextContent('Log set');
  });

  it('names the warm-up and the edit the same way', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <SetLogger
        units="lb"
        target={{ ...working, kind: 'warmup', label: 'Ramp 1 of 2' }}
        initial={{ weight: 60, reps: 0, rir: 5 }}
        mode="log"
        weightStep={5}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('log-set')).toHaveTextContent('Skip warm-up set');
    unmount();
    render(
      <SetLogger
        units="lb"
        target={working}
        initial={{ weight: 100, reps: 1, rir: 2 }}
        mode="edit"
        weightStep={5}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('log-set')).toHaveTextContent('Save set');
    await user.click(screen.getByRole('button', { name: 'Decrease reps' }));
    expect(screen.getByTestId('log-set')).toHaveTextContent('Save as skipped');
  });
});
