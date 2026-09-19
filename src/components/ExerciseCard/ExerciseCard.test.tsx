import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { ExerciseCard } from './ExerciseCard';

// The card is presentational; the user's own media comes from the store in the app.
vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));

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
const block = workout.blocks[0]!;
const entry = allEntries(workout.blocks)[0]!;

describe('ExerciseCard', () => {
  it('shows the demonstration, keeps the header lean, and reveals tempo details on tap', async () => {
    const user = userEvent.setup();
    const onShowDetail = vi.fn();
    render(
      <ExerciseCard
        entry={entry}
        block={block}
        units="lb"
        position={null}
        logged={[]}
        previous={null}
        availableEquipment={new Set(gym?.equipment ?? [])}
        onShowDetail={onShowDetail}
      >
        <div>rows</div>
      </ExerciseCard>,
    );
    expect(screen.getByTestId('exercise-thumb')).toHaveAttribute('width', '96');
    // The header no longer repeats last time; it lives behind How to. Only the max offer keeps a line.
    expect(screen.queryByText(/First time logged/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-line')).not.toBeInTheDocument();
    expect(screen.queryByText(/Barbell \+ plates/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('tempo-detail')).not.toBeInTheDocument();

    // The notation sits at the end of the phase labels, inside the bar's own button: one tap target.
    const chip = screen.getByTestId('tempo-line');
    const toggle = screen.getByTestId('tempo-toggle');
    expect(chip).toHaveTextContent(/^Tempo\s*\d-\d-[\dX]-\d ▾$/);
    expect(toggle).toContainElement(chip);
    expect(toggle).toContainElement(screen.getByTestId('tempo-bar'));
    expect(screen.getByTestId('card-thumb').parentElement?.children).toHaveLength(1);
    await user.click(chip);
    expect(screen.getByTestId('tempo-detail')).toHaveTextContent(/Cue/);
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Tempo',
      'Cue',
      'Effort',
      'Rest',
    ]);
    expect(screen.getByTestId('tempo-why')).not.toHaveAttribute('open');
    expect(
      screen.getByRole('list', { name: 'Why this tempo, effort, and rest', hidden: true }).children
        .length,
    ).toBeGreaterThan(1);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(chip);
    expect(screen.queryByTestId('tempo-detail')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('card-thumb'));
    expect(onShowDetail).toHaveBeenCalledTimes(1);
  });
});
