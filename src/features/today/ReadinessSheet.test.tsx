import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReadinessSheet } from './ReadinessSheet';

describe('the check-in, in words', () => {
  it('names each level and hands back the numbers the engines expect', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReadinessSheet open initial={null} onClose={vi.fn()} onSubmit={onSubmit} />);
    const group = (name: string) => screen.getByRole('radiogroup', { name });
    expect(group('Energy')).toHaveTextContent('Drained');
    expect(group('Soreness')).toHaveTextContent('Wrecked');
    expect(group('Sleep')).toHaveTextContent('Great');
    expect(group('Motivation')).toHaveTextContent('Fired up');
    expect(screen.queryByRole('radio', { name: '3' })).toBeNull();
    await user.click(within(group('Energy')).getByRole('radio', { name: 'Good' }));
    await user.click(within(group('Motivation')).getByRole('radio', { name: 'Fired up' }));
    await user.click(screen.getByTestId('readiness-apply'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ energy: 4, motivation: 5, soreness: 2, sleep: 3 }),
    );
  });
});
