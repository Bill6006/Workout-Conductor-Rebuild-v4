import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetLogger } from './SetLogger';

/** Maintenance 27, item 43: the logger on today's reserve check. */
const target = {
  kind: 'working' as const,
  reps: [10, 15] as [number, number],
  rir: 1,
  weight: 40,
  label: 'Set 3 of 3',
};

function checkLogger(props: Partial<Parameters<typeof SetLogger>[0]> = {}) {
  const onCommit = vi.fn();
  render(
    <SetLogger
      units="lb"
      target={target}
      initial={{ weight: 40, reps: 12, rir: 1 }}
      mode="log"
      weightStep={5}
      onCommit={onCommit}
      reserveCheck={{}}
      {...props}
    />,
  );
  return onCommit;
}

describe('the logger on a reserve check', () => {
  it('says what to do, names the dials for the stop, and adds the reps in all', () => {
    checkLogger();
    expect(screen.getByTestId('check-note')).toHaveTextContent(
      'Reserve check: lift to your usual stop and judge the reps left, then keep going without racking until you cannot finish a rep with good form (a burn is not failure).',
    );
    expect(screen.getByRole('button', { name: /^Reps at your stop, 12/ })).toBeInTheDocument();
    expect(screen.getByTestId('logger-total')).toHaveTextContent('14');
    expect(screen.getByTestId('reps-hint')).toHaveTextContent('At your usual stop');
    expect(screen.getByTestId('rir-hint')).toHaveTextContent('Judged at the stop');
    expect(screen.getByTestId('total-hint')).toHaveTextContent('Every good rep, in all');
  });

  it("logs the set at the stop and the check's reps in all", async () => {
    const user = userEvent.setup();
    const onCommit = checkLogger();
    await user.click(screen.getByRole('button', { name: 'Increase reps in all' }));
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledWith({
      weight: 40,
      reps: 12,
      rir: 1,
      reserveCheck: { total: 15 },
    });
  });

  it('takes the reps in all as typed, even while the dial is still open', async () => {
    const user = userEvent.setup();
    const onCommit = checkLogger();
    await user.click(screen.getByTestId('logger-total'));
    const input = screen.getByRole('spinbutton', { name: 'Reps in all' });
    await user.clear(input);
    await user.type(input, '17');
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ reserveCheck: { total: 17 } }));
  });

  it('warns when the reps in all are fewer than at the stop', async () => {
    const user = userEvent.setup();
    checkLogger({ reserveCheck: { total: 12 } });
    await user.click(screen.getByRole('button', { name: 'Decrease reps in all' }));
    expect(screen.getByTestId('total-hint')).toHaveTextContent('At least the reps at your stop');
  });

  it('a set that stalled before the stop logs its reps in all with nothing in reserve', async () => {
    const user = userEvent.setup();
    const onCommit = checkLogger({ reserveCheck: { total: 9 } });
    await user.click(screen.getByTestId('check-failed-early'));
    // Only the weight and the reps in all are asked now.
    expect(screen.queryByTestId('logger-reps')).toBeNull();
    expect(screen.queryByTestId('logger-rir')).toBeNull();
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledWith({
      weight: 40,
      reps: 9,
      rir: 0,
      reserveCheck: { total: 9, failedEarly: true },
    });
  });

  it('asks about a slip in the reps in all of a set that stalled early', async () => {
    const user = userEvent.setup();
    const question = vi.fn((values: { reps: number }) =>
      values.reps > 30
        ? { field: 'reps' as const, text: `${values.reps} reps looks like a slip.` }
        : null,
    );
    const onCommit = checkLogger({ reserveCheck: { total: 9 }, question });
    await user.click(screen.getByTestId('check-failed-early'));
    await user.click(screen.getByTestId('logger-total'));
    const input = screen.getByRole('spinbutton', { name: 'Reps in all' });
    await user.clear(input);
    await user.type(input, '120');
    await user.click(screen.getByTestId('log-set'));
    // The set keeps its reps in all: those are what the question reads.
    expect(onCommit).not.toHaveBeenCalled();
    expect(question).toHaveBeenLastCalledWith(expect.objectContaining({ reps: 120, rir: 0 }));
    expect(screen.getByTestId('slip-question')).toHaveTextContent('120 reps looks like a slip.');
  });

  it('names on Keep, and skips by, what a set that stalled early keeps', async () => {
    const user = userEvent.setup();
    const question = (values: { reps: number }) =>
      values.reps > 30
        ? { field: 'reps' as const, text: `${values.reps} reps looks like a slip.` }
        : null;
    checkLogger({ reserveCheck: { total: 9 }, question });
    await user.click(screen.getByTestId('check-failed-early'));
    await user.click(screen.getByTestId('logger-total'));
    const input = screen.getByRole('spinbutton', { name: 'Reps in all' });
    await user.clear(input);
    await user.type(input, '80');
    await user.click(screen.getByTestId('log-set'));
    expect(screen.getByRole('button', { name: /^Log 40 lb × 80$/ })).toBeInTheDocument();
  });

  it('a set that stalled early with none in all is a skip', async () => {
    const user = userEvent.setup();
    checkLogger({ reserveCheck: { total: 1 } });
    await user.click(screen.getByTestId('check-failed-early'));
    await user.click(screen.getByRole('button', { name: 'Decrease reps in all' }));
    expect(screen.getByTestId('log-set')).toHaveAttribute('data-intent', 'skip');
  });

  it('takes one switch or the other, never both', async () => {
    const user = userEvent.setup();
    checkLogger();
    await user.click(screen.getByTestId('check-failed-early'));
    await user.click(screen.getByTestId('check-stopped'));
    expect(screen.getByTestId('check-failed-early')).not.toBeChecked();
    await user.click(screen.getByTestId('check-failed-early'));
    expect(screen.getByTestId('check-stopped')).not.toBeChecked();
  });

  it('a set stopped for pain or form says so', async () => {
    const user = userEvent.setup();
    const onCommit = checkLogger({ reserveCheck: { total: 12 } });
    await user.click(screen.getByTestId('check-stopped'));
    await user.click(screen.getByTestId('log-set'));
    expect(onCommit).toHaveBeenCalledWith({
      weight: 40,
      reps: 12,
      rir: 1,
      reserveCheck: { total: 12, stopped: true },
    });
  });

  it('a correction opens on the numbers the check had', () => {
    checkLogger({ mode: 'edit', reserveCheck: { total: 16, stopped: true } });
    expect(screen.getByTestId('logger-total')).toHaveTextContent('16');
    expect(screen.getByTestId('check-stopped')).toBeChecked();
  });

  it('is a plain logger on any other set', () => {
    checkLogger({ reserveCheck: null });
    expect(screen.queryByTestId('check-panel')).toBeNull();
    expect(screen.queryByTestId('logger-total')).toBeNull();
    expect(screen.getByTestId('reps-hint')).toHaveTextContent('Target 10-15');
  });

  it('is never on a hold', () => {
    checkLogger({ hold: true });
    expect(screen.queryByTestId('check-panel')).toBeNull();
  });
});
