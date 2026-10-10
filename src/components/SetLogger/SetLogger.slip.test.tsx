import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SlipQuestion } from '../../engine/progression/slips';
import { SetLogger, type SetLoggerValues } from './SetLogger';

const target = {
  kind: 'working' as const,
  reps: [4, 6] as [number, number],
  rir: 2,
  weight: 185,
  label: 'Set 1 of 3',
};

/** Questions any weight past 500 and any reps past 30, as the screen's rule would. */
const question = (values: SetLoggerValues): SlipQuestion | null =>
  values.weight !== null && values.weight > 500
    ? { field: 'weight', text: `${values.weight} lb looks like a slip.` }
    : values.reps > 30
      ? { field: 'reps', text: `${values.reps} reps looks like a slip.` }
      : null;

function renderLogger(onCommit = vi.fn(), mode: 'log' | 'edit' = 'log') {
  render(
    <SetLogger
      units="lb"
      target={target}
      initial={{ weight: 185, reps: 5, rir: 2 }}
      mode={mode}
      weightStep={5}
      onCommit={onCommit}
      onCancel={() => undefined}
      question={question}
    />,
  );
  return onCommit;
}

async function typeWeight(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(screen.getByTestId('logger-weight'));
  const input = screen.getByRole('spinbutton', { name: 'Weight' });
  await user.clear(input);
  await user.type(input, value);
}

describe('SetLogger: numbers that look like slips (Maintenance 26, item 40)', () => {
  it('logs a plausible set in one tap, as before', async () => {
    const user = userEvent.setup();
    const onCommit = renderLogger();
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledWith({ weight: 185, reps: 5, rir: 2 });
    expect(screen.queryByTestId('slip-question')).toBeNull();
  });

  it('asks once about a slip and logs nothing until the lifter answers', async () => {
    const user = userEvent.setup();
    const onCommit = renderLogger();
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).not.toHaveBeenCalled();
    const asked = screen.getByRole('alert');
    expect(asked).toHaveTextContent('1850 lb looks like a slip.');
    expect(screen.queryByTestId('log-set')).toBeNull();
    // The safe answer holds the focus.
    expect(screen.getByTestId('slip-change')).toHaveFocus();
    expect(screen.getByTestId('slip-keep')).toHaveTextContent('Log 1850 lb × 5');
  });

  it('keeps the number with one tap', async () => {
    const user = userEvent.setup();
    const onCommit = renderLogger();
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    await waitFor(() => expect(screen.getByTestId('slip-keep')).toBeEnabled());
    await user.click(screen.getByTestId('slip-keep'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ weight: 1850, reps: 5, rir: 2 });
    expect(screen.queryByTestId('slip-question')).toBeNull();
  });

  it('changes it: back to the number asked about, ready to type', async () => {
    const user = userEvent.setup();
    const onCommit = renderLogger();
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    await user.click(screen.getByTestId('slip-change'));
    const input = screen.getByRole('spinbutton', { name: 'Weight' });
    expect(input).toHaveFocus();
    expect(screen.queryByTestId('slip-question')).toBeNull();
    await user.clear(input);
    await user.type(input, '185');
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledWith({ weight: 185, reps: 5, rir: 2 });
  });

  it('asks about reps by the reps dial', async () => {
    const user = userEvent.setup();
    const onCommit = renderLogger();
    await user.click(screen.getByTestId('logger-reps'));
    const input = screen.getByRole('spinbutton', { name: 'Reps' });
    await user.clear(input);
    await user.type(input, '55');
    await user.click(screen.getByTestId('log-set'));
    expect(screen.getByRole('alert')).toHaveTextContent('55 reps looks like a slip.');
    await user.click(screen.getByTestId('slip-change'));
    expect(screen.getByRole('spinbutton', { name: 'Reps' })).toHaveFocus();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a turn of the dial takes the question away', async () => {
    const user = userEvent.setup();
    const onCommit = renderLogger();
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    await user.click(screen.getByRole('button', { name: 'Decrease reps' }));
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(screen.getByTestId('log-set')).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('says Save when a set is corrected', async () => {
    const user = userEvent.setup();
    const onCommit = renderLogger(vi.fn(), 'edit');
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    expect(screen.getByTestId('slip-keep')).toHaveTextContent('Save 1850 lb × 5');
    await waitFor(() => expect(screen.getByTestId('slip-keep')).toBeEnabled());
    await user.click(screen.getByTestId('slip-keep'));
    expect(onCommit).toHaveBeenCalledWith({ weight: 1850, reps: 5, rir: 2 });
  });
});

describe('SetLogger after the review of item 40', () => {
  it('puts Change it where the log button stood: Enter again changes the number, never logs it', async () => {
    const user = userEvent.setup();
    const onCommit = renderLogger();
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    const keep = screen.getByTestId('slip-keep');
    const change = screen.getByTestId('slip-change');
    expect(keep.nextElementSibling).toBe(change);
    expect(change).toHaveAccessibleDescription('1850 lb looks like a slip.');
    expect(keep).toHaveAccessibleDescription('1850 lb looks like a slip.');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('spinbutton', { name: 'Weight' })).toHaveFocus();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps Cancel while it asks about an edit', async () => {
    const user = userEvent.setup();
    renderLogger(vi.fn(), 'edit');
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it("takes the question away when a hold's countdown fills new seconds", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const hold = { ...target, reps: [20, 40] as [number, number] };
    const view = (filled: { reps: number; nonce: string } | null) => (
      <SetLogger
        units="lb"
        target={hold}
        initial={{ weight: 185, reps: 30, rir: null }}
        mode="log"
        weightStep={5}
        onCommit={onCommit}
        hold
        filled={filled}
        question={question}
      />
    );
    const { rerender } = render(view(null));
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(view({ reps: 40, nonce: 'filled-1' }));
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(screen.getByTestId('log-set')).toBeInTheDocument();
  });
});

describe('SetLogger after the re-check of item 40', () => {
  it('lets Keep wait a moment, so a second tap meant for Log keeps nothing unread', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onCommit = renderLogger();
      await typeWeight(user, '1850');
      await user.click(screen.getByTestId('log-set'));
      expect(screen.getByTestId('slip-keep')).toBeDisabled();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByTestId('slip-keep')).toBeEnabled();
      expect(onCommit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a question asked again wait its own moment', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onCommit = renderLogger();
      await typeWeight(user, '1850');
      await user.click(screen.getByTestId('log-set'));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      // Change it, then Log again at once: the second question waits from when it opened (the
      // third pass of item 40: it took the first one's wait and was ready early).
      await user.click(screen.getByTestId('slip-change'));
      await user.click(screen.getByTestId('log-set'));
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByTestId('slip-keep')).toBeDisabled();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('slip-keep')).toBeEnabled();
      expect(onCommit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("puts the alert on the question's words alone", async () => {
    const user = userEvent.setup();
    renderLogger();
    await typeWeight(user, '1850');
    await user.click(screen.getByTestId('log-set'));
    expect(screen.getByRole('alert')).toHaveTextContent(/^1850 lb looks like a slip\.$/);
  });
});
