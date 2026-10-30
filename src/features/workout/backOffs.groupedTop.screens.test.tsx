import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { LoggedSets } from './LoggedSets';
import { record, type SetSpec } from '../../test/records';
import { BENCH, bench, plan, run, shape } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, on the Workout tab's set list (the third review of round N):
 * a top set and back-offs with the same numbers stay apart, never one row named "Top set".
 * Synthetic data only.
 */

function structured(
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

describe('the set list of a top set and back-offs with the same numbers, the third review of round N', () => {
  it('never names the back-offs "Top set"', async () => {
    // Back-offs far easier than asked, two sessions running: the drop narrows to nothing.
    const easy: SetSpec[] = [
      [5, 180, 4],
      [5, 180, 4],
      [5, 180, 4],
    ];
    const history = [structured(7, [5, 190, 1], easy), structured(3, [5, 190, 1], easy)];
    const harder = run({ type: 'intensity', direction: 'harder' }, plan(history), { history });
    const entry = bench(harder.workout);
    const working = shape(entry);
    expect(working[0]).toEqual([195, 1, 'top']);
    expect(working.slice(1).every((set) => set[0] === 195 && set[1] === 1)).toBe(true);
    const user = userEvent.setup();
    render(
      <LoggedSets
        entry={entry}
        logged={[]}
        units="lb"
        currentSetIndex={entry.sets[0]!.index}
        undoable={null}
        onEdit={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('sets-summary'));
    const rows = screen.getAllByTestId('set-row').filter((row) => row.dataset.state === 'upcoming');
    const named = rows.find((row) => row.textContent?.includes('Top set'))!;
    expect(named).toBeDefined();
    // The row named "Top set" is the top set alone; the back-offs are listed as back-offs.
    expect(named).toHaveAttribute('data-count', '1');
    expect(rows.some((row) => /Back-off/.test(row.textContent ?? ''))).toBe(true);
  });
});
