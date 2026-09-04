import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
const working = entry.sets.filter((set) => set.kind === 'working');
const firstWorking = working[0]!;

describe('LoggedSets', () => {
  it('shows only the current row plus one collapsed line before anything is logged', async () => {
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
    expect(screen.getAllByTestId('set-row')).toHaveLength(2);
    expect(screen.getByTestId('sets-summary')).toHaveTextContent(
      `${entry.sets.length - 1} more sets · ${firstWorking.targetReps[0]}-${firstWorking.targetReps[1]} reps @ RIR ${firstWorking.targetRir}`,
    );
    expect(screen.getByTestId('set-aside')).toHaveTextContent('log below');

    await user.click(screen.getByTestId('sets-summary'));
    expect(screen.getAllByTestId('set-row')).toHaveLength(entry.sets.length);
    expect(screen.getAllByTestId('set-aside').at(-1)).toHaveTextContent(/rest/);
    await user.click(screen.getByTestId('sets-collapse'));
    expect(screen.getAllByTestId('set-row')).toHaveLength(2);
  });

  it('keeps logged rows open and carries the target load on the current row', () => {
    const loggedEntry = {
      ...entry,
      sets: entry.sets.map((set) => ({ ...set, targetWeight: set.kind === 'working' ? 185 : 95 })),
    };
    render(
      <LoggedSets
        entry={loggedEntry}
        logged={[
          {
            entryId: entry.id,
            exerciseId: entry.exerciseId,
            setIndex: entry.sets[0]!.index,
            kind: entry.sets[0]!.kind,
            reps: 5,
            weight: 95,
            rir: 5,
            completedAt: NOW,
          },
        ]}
        units="lb"
        currentSetIndex={entry.sets[1]!.index}
        undoable={{ entryId: entry.id, setIndex: entry.sets[0]!.index }}
        onEdit={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    const rows = screen.getAllByTestId('set-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('logged-value')).toHaveTextContent('95');
    expect(screen.getByTestId('undo-set')).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('set-aside')).toHaveTextContent(
      entry.sets[1]!.kind === 'working' ? '185 lb' : '95 lb',
    );
    expect(screen.getByTestId('sets-summary').parentElement).toHaveTextContent('185 lb');
  });
});
