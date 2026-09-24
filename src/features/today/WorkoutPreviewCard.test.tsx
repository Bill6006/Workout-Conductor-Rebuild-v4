import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { TEST_NOW, Providers, createTestStore } from '../../test/testStore';
import { WorkoutPreviewCard } from './WorkoutPreviewCard';

/**
 * Maintenance 22: an exercise stopped at its logged sets says so on Today, counting only the sets
 * it logged (a set skipped was not done), and no longer carries the Main lift badge.
 */

const [, gym] = createDefaultLocations({ gymAccess: true }, TEST_NOW);

/** The bench press stopped after its ramps, one working set logged and one skipped, two owed. */
function withStoppedBench(): { workout: GeneratedWorkout; benchId: string; logged: Set<string> } {
  const workout = generateWorkout({
    profile: { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    location: gym,
    history: [],
    now: TEST_NOW,
    duration: 'default',
  });
  const bench = allEntries(workout.blocks)[0]!;
  const ramps = bench.sets.filter((set) => set.kind === 'warmup');
  const [first, second] = bench.sets.filter((set) => set.kind === 'working');
  bench.sets = [...ramps, first!, second!];
  bench.warmupSets = ramps.length;
  bench.stopped = { owed: 2, why: 'swap' };
  // The second working set was skipped: only the ramps and the first were logged.
  const logged = new Set([...ramps, first!].map((set) => `${bench.id}:${set.index}`));
  return { workout, benchId: bench.id, logged };
}

function renderCard(workout: GeneratedWorkout, logged: ReadonlySet<string>) {
  const handle = createTestStore();
  render(
    <Providers store={handle.store}>
      <WorkoutPreviewCard
        workout={workout}
        defaultEstimatedMinutes={60}
        location={gym}
        onSelect={() => undefined}
        onDurationChange={() => undefined}
        logged={logged}
      />
    </Providers>,
  );
}

describe('a stopped exercise on Today', () => {
  it('counts the sets it logged, not the one skipped, and drops the Main lift badge', () => {
    const { workout, benchId, logged } = withStoppedBench();
    renderCard(workout, logged);
    const row = screen
      .getAllByTestId('workout-entry')
      .find((item) => item.getAttribute('data-entry-id') === benchId)!;
    expect(within(row).getByTestId('entry-meta').textContent).toBe('Stopped: 1 of 4 sets done');
    expect(within(row).queryByText('Main lift')).toBeNull();
  });

  it('says it stopped before its working sets when only its warm-up was done', () => {
    const { workout, benchId } = withStoppedBench();
    const bench = allEntries(workout.blocks).find((entry) => entry.id === benchId)!;
    bench.sets = bench.sets.filter((set) => set.kind === 'warmup');
    bench.stopped = { owed: 4, why: 'place' };
    renderCard(workout, new Set());
    const row = screen
      .getAllByTestId('workout-entry')
      .find((item) => item.getAttribute('data-entry-id') === benchId)!;
    expect(within(row).getByTestId('entry-meta').textContent).toBe(
      'Stopped before its working sets',
    );
  });
});
