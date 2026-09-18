import { render, screen } from '@testing-library/react';
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
