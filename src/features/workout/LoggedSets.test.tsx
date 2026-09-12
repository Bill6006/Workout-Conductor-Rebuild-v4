import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CompletedSet } from '../../engine/recalibration/types';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { LoggedSets } from './LoggedSets';

const NOW = '2026-09-03T14:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const workout = generateWorkout({
  profile,
  location: gym,
  history: [],
  now: NOW,
  duration: 'default',
});
const entry = allEntries(workout.blocks)[0]!;
const ramps = entry.sets.filter((set) => set.kind === 'warmup');
const working = entry.sets.filter((set) => set.kind === 'working');

function log(setIndex: number, values: Partial<CompletedSet> = {}): CompletedSet {
  const set = entry.sets.find((candidate) => candidate.index === setIndex)!;
  return {
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex,
    kind: set.kind,
    reps: 5,
    weight: 95,
    rir: 2,
    completedAt: NOW,
    ...values,
  };
}

describe('LoggedSets', () => {
  it('shows one collapsed line before anything is logged and never repeats the current set', async () => {
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
    // No "now" row: the logger below the list names the set in front of you.
    expect(screen.getAllByTestId('set-row')).toHaveLength(1);
    expect(screen.getByTestId('sets-summary')).toHaveTextContent(
      `${entry.sets.length} more sets · ${working[0]!.targetReps[0]}-${working[0]!.targetReps[1]} reps @ RIR ${working[0]!.targetRir}`,
    );
    // A first-time bar lift starts at the empty bar, so the next set already carries a load.
    expect(screen.getByTestId('set-aside')).toHaveTextContent('45 lb');

    await user.click(screen.getByTestId('sets-summary'));
    expect(screen.getAllByTestId('set-row')).toHaveLength(entry.sets.length);
    expect(screen.getAllByTestId('set-aside').at(-1)).toHaveTextContent(/rest/);
    await user.click(screen.getByTestId('sets-collapse'));
    expect(screen.getAllByTestId('set-row')).toHaveLength(1);
  });

  it('folds finished ramps into one line that opens on tap, and carries Undo with them', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onUndo = vi.fn();
    const lastRamp = ramps[ramps.length - 1]!;
    render(
      <LoggedSets
        entry={entry}
        logged={ramps.map((set) =>
          log(set.index, { skipped: true, reps: 0, weight: null, rir: null }),
        )}
        units="lb"
        currentSetIndex={working[0]!.index}
        undoable={{ entryId: entry.id, setIndex: lastRamp.index }}
        onEdit={onEdit}
        onUndo={onUndo}
      />,
    );
    expect(screen.getAllByTestId('set-row')).toHaveLength(2);
    expect(screen.getByTestId('ramps-summary')).toHaveTextContent(
      `${ramps.length} ramps · skipped`,
    );
    await user.click(screen.getByTestId('undo-set'));
    expect(onUndo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('ramps-summary'));
    expect(screen.queryByTestId('ramps-summary')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('logged-value')).toHaveLength(ramps.length);
    expect(screen.getAllByTestId('logged-value')[0]).toHaveTextContent('skipped');
  });

  it('keeps every finished working set as its own editable line', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <LoggedSets
        entry={entry}
        logged={[
          ...ramps.map((set) =>
            log(set.index, { skipped: true, reps: 0, weight: null, rir: null }),
          ),
          log(working[0]!.index, { reps: 6, weight: 185, rir: 2 }),
        ]}
        units="lb"
        currentSetIndex={working[1]!.index}
        undoable={null}
        onEdit={onEdit}
        onUndo={vi.fn()}
      />,
    );
    // One folded ramp line, one finished working line, one collapsed upcoming line.
    expect(screen.getAllByTestId('set-row')).toHaveLength(3);
    const value = screen.getByTestId('logged-value');
    expect(value).toHaveTextContent('185 lb × 6 @ RIR 2');
    await user.click(value);
    expect(onEdit).toHaveBeenCalledWith(working[0]!.index);
  });
});
