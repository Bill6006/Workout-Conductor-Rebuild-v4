import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetLogger } from './SetLogger';

const target = {
  kind: 'working' as const,
  reps: [4, 6] as [number, number],
  rir: 2,
  weight: null,
  label: 'Set 2 of 4',
};

describe('SetLogger', () => {
  it('logs a normal set in one tap with the prefilled values', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <SetLogger
        units="lb"
        target={target}
        initial={{ weight: 185, reps: 6, rir: 2 }}
        mode="log"
        weightStep={5}
        onCommit={onCommit}
      />,
    );
    expect(screen.getByTestId('logger-weight')).toHaveTextContent('185');
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ weight: 185, reps: 6, rir: 2 });
    // A second tap inside the cooldown cannot log the same set twice.
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('nudges values with one large chevron each and types on the numeric keyboard', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <SetLogger
        units="kg"
        target={target}
        initial={{ weight: null, reps: 6, rir: 2 }}
        mode="log"
        weightStep={2.5}
        onCommit={onCommit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Increase weight' }));
    expect(screen.getByTestId('logger-weight')).toHaveTextContent('2.5');
    await user.click(screen.getByRole('button', { name: 'Decrease reps' }));
    expect(screen.getByTestId('logger-reps')).toHaveTextContent('5');
    await user.click(screen.getByTestId('logger-reps'));
    const input = screen.getByRole('spinbutton', { name: 'Reps' });
    await user.clear(input);
    await user.type(input, '12{Enter}');
    expect(screen.getByTestId('logger-reps')).toHaveTextContent('12');
    await user.click(screen.getByRole('button', { name: 'Decrease RIR' }));
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledWith({ weight: 2.5, reps: 12, rir: 1 });
  });

  it('edits in place with save, cancel, and remove', async () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <SetLogger
        units="lb"
        target={{ ...target, label: 'Set 1 of 4' }}
        initial={{ weight: 185, reps: 5, rir: 2 }}
        mode="edit"
        weightStep={5}
        onCommit={onCommit}
        onCancel={onCancel}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByRole('region', { name: 'Edit set' })).toHaveTextContent(
      'Editing Set 1 of 4',
    );
    await user.click(screen.getByRole('button', { name: 'Increase reps' }));
    await user.click(screen.getByRole('button', { name: 'Save set' }));
    expect(onCommit).toHaveBeenCalledWith({ weight: 185, reps: 6, rir: 2 });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('cannot log while disabled and warns when reps leave the target range', () => {
    render(
      <SetLogger
        units="lb"
        target={target}
        initial={{ weight: 185, reps: 9, rir: 2 }}
        mode="log"
        weightStep={5}
        onCommit={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByTestId('log-set')).toBeDisabled();
    expect(screen.getByTestId('logger-reps').closest('[data-field="reps"]')).toHaveAttribute(
      'data-tone',
      'warn',
    );
  });
});
