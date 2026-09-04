import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { ExerciseCard } from './ExerciseCard';

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
    expect(screen.getByText('First time logged')).toBeInTheDocument();
    expect(screen.queryByText(/Barbell \+ plates/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('tempo-detail')).not.toBeInTheDocument();

    const chip = screen.getByTestId('tempo-line');
    expect(chip).toHaveTextContent(/^Tempo \d-\d-[\dX] ▾$/);
    await user.click(chip);
    expect(screen.getByTestId('tempo-detail')).toHaveTextContent(/Cue: /);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    await user.click(chip);
    expect(screen.queryByTestId('tempo-detail')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('card-thumb'));
    expect(onShowDetail).toHaveBeenCalledTimes(1);
  });
});
