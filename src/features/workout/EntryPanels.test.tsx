import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { loadingFor } from '../../engine/loading/loading';
import type { WorkoutBlock, WorkoutEntry } from '../../engine/workout/types';
import { EntryPanels } from './EntryPanels';

/**
 * Maintenance 25, item 8: the Plates panel draws a bar's plates; any other load is a line of text
 * and a note that says what it means here.
 */

function platesPanel(exerciseId: string, blockKind: WorkoutBlock['kind'], weight: number) {
  const exercise = requireExercise(exerciseId);
  // Only the ids and the block's kind reach this panel.
  const entry = { id: 'entry-1', exerciseId } as unknown as WorkoutEntry;
  const block = { id: 'block-1', kind: blockKind } as unknown as WorkoutBlock;
  render(
    <EntryPanels
      entry={entry}
      block={block}
      exercise={exercise}
      units="lb"
      currentWeight={weight}
      instruction={undefined}
      onSaveNotes={vi.fn(() => Promise.resolve())}
      onHowTo={vi.fn()}
      onOptions={vi.fn()}
      loading={loadingFor(undefined, { missingPlates: [] }, exercise, 'lb')}
      spec={null}
      placeName="Gym"
      missingPlates={[]}
      onSaveLoading={vi.fn(() => Promise.resolve())}
      onSetMissingPlates={vi.fn(() => Promise.resolve())}
    />,
  );
  fireEvent.click(screen.getByTestId('plates-tab'));
  return screen.getByTestId('plate-math');
}

describe('the Plates panel', () => {
  it('draws a bar, and confirms its sum under the drawing', () => {
    const panel = platesPanel('barbell-bench-press', 'straight', 185);
    expect(panel.querySelector('[data-testid="plate-stack"]')).not.toBeNull();
    expect(screen.getByTestId('plate-caption')).toHaveTextContent(
      '185 lb = 45 lb bar + 70 lb of plates each side',
    );
  });

  it('says a dumbbell or kettlebell load is per hand', () => {
    const panel = platesPanel('incline-dumbbell-press', 'straight', 50);
    expect(panel.querySelector('[data-testid="plate-stack"]')).toBeNull();
    expect(panel).toHaveTextContent('50 lb in each hand (2 × 50)');
    expect(panel).toHaveTextContent('Dumbbell and kettlebell loads are per hand.');
  });

  it('on a machine says to set the pin before a superset round, and that nothing is loaded otherwise', () => {
    const round = platesPanel('leg-curl', 'superset', 90);
    expect(round).toHaveTextContent('Set the pin before the round starts.');
    expect(round).not.toHaveTextContent('No plates to load.');
  });

  it('on a machine on its own says there are no plates to load', () => {
    const single = platesPanel('leg-curl', 'straight', 90);
    expect(single).toHaveTextContent('No plates to load.');
    expect(single).not.toHaveTextContent('Set the pin');
  });
});
