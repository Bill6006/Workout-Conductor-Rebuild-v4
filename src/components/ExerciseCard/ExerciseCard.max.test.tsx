import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { ExerciseCard } from './ExerciseCard';

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

describe('ExerciseCard max offer', () => {
  it('offers the one-time max entry beside "First time logged" only when the screen provides it', async () => {
    const user = userEvent.setup();
    const onKnowMax = vi.fn();
    const props = {
      entry,
      block,
      units: 'lb' as const,
      position: null,
      logged: [],
      previous: null,
      availableEquipment: new Set(gym?.equipment ?? []),
    };
    const { rerender } = render(
      <ExerciseCard {...props} onKnowMax={onKnowMax}>
        <div>rows</div>
      </ExerciseCard>,
    );
    expect(screen.getByText(/First time logged/)).toBeInTheDocument();
    const link = screen.getByTestId('know-max');
    expect(link).toHaveTextContent('Know your max?');
    await user.click(link);
    expect(onKnowMax).toHaveBeenCalledTimes(1);

    rerender(
      <ExerciseCard {...props}>
        <div>rows</div>
      </ExerciseCard>,
    );
    expect(screen.queryByTestId('know-max')).not.toBeInTheDocument();
  });
});
