import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RatingSheet } from './RatingSheet';

describe('energy after, in words', () => {
  it('offers five words and saves the number behind the one picked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <RatingSheet open endedEarly={false} onClose={vi.fn()} onSave={onSave} onDiscard={vi.fn()} />,
    );
    const group = screen.getByTestId('energy-after');
    expect(group).toHaveTextContent('Drained');
    expect(group).toHaveTextContent('Full');
    expect(screen.getByRole('radio', { name: 'Okay' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Good' }));
    await user.click(screen.getByRole('button', { name: 'Save workout' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ energyAfter: 4 }));
  });
});

describe('pain, in two plain answers', () => {
  it('starts at No pain, asks where on Some pain, and saves the joint with it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <RatingSheet open endedEarly={false} onClose={vi.fn()} onSave={onSave} onDiscard={vi.fn()} />,
    );
    const pain = screen.getByRole('radiogroup', { name: 'Pain' });
    expect(within(pain).getByRole('radio', { name: 'No pain' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByRole('radiogroup', { name: 'Where?' })).not.toBeInTheDocument();

    await user.click(within(pain).getByRole('radio', { name: 'Some pain' }));
    const where = screen.getByRole('radiogroup', { name: 'Where?' });
    await user.click(within(where).getByRole('radio', { name: 'Lower back' }));
    await user.click(screen.getByRole('button', { name: 'Save workout' }));
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ pain: true, joint: 'lower-back' }),
    );

    // Back to No pain: the joint does not go with it.
    await user.click(within(pain).getByRole('radio', { name: 'No pain' }));
    await user.click(screen.getByRole('button', { name: 'Save workout' }));
    const saved = onSave.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(saved.pain).toBe(false);
    expect(saved).not.toHaveProperty('joint');
  });
});
