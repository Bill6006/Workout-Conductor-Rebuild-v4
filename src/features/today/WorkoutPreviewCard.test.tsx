import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { ChangeSummary } from '../../engine/recalibration/types';
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

function renderCard(
  workout: GeneratedWorkout,
  logged: ReadonlySet<string>,
  summary: ChangeSummary | null = null,
  defaultEstimatedMinutes = 60,
) {
  const handle = createTestStore();
  render(
    <Providers store={handle.store}>
      <WorkoutPreviewCard
        workout={workout}
        defaultEstimatedMinutes={defaultEstimatedMinutes}
        location={gym}
        onSelect={() => undefined}
        onDurationChange={() => undefined}
        logged={logged}
        summary={summary}
      />
    </Providers>,
  );
}

describe("the time under the length (Maintenance 29, the owner's item 10)", () => {
  const plan = (duration: 'default' | 15) =>
    generateWorkout({
      profile: { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      location: gym,
      history: [],
      now: TEST_NOW,
      duration,
    });

  it('says nothing the dropdown already says', () => {
    const workout = plan('default');
    renderCard(workout, new Set(), null, workout.duration.estimatedMinutes);
    expect(
      screen.getByRole('option', { name: `Default: ${workout.duration.estimatedMinutes} min` }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('workout-estimate')).not.toBeInTheDocument();
  });

  it("says the plan's own minutes should they ever part from the dropdown's", () => {
    const changed = plan('default');
    renderCard(changed, new Set(), null, changed.duration.estimatedMinutes + 6);
    expect(screen.getByTestId('workout-estimate')).toHaveTextContent(
      `Default time: about ${changed.duration.estimatedMinutes} min.`,
    );
  });

  it('says a plan running over its length', () => {
    const over = plan('default');
    over.duration = { ...over.duration, overByMinutes: 4 };
    renderCard(over, new Set(), null, over.duration.estimatedMinutes);
    expect(screen.getByTestId('workout-estimate')).toHaveTextContent(
      'It may run a few minutes over.',
    );
  });

  it('says what a chosen length was fitted to', () => {
    // Even where its minutes happen to match the Default's.
    const short = plan(15);
    renderCard(short, new Set(), null, short.duration.estimatedMinutes);
    expect(screen.getByTestId('workout-estimate')).toHaveTextContent('Fitted to 15 min');
  });
});

describe('why this workout on Today', () => {
  it('shows every line of a list that says one thing twice, each under a key of its own', () => {
    // Maintenance 25, the owner's item 39: a repeated line was its own key, so React saw two
    // children with the same key. The engine no longer repeats a line; the list keys stay safe.
    const workout = generateWorkout({
      profile: { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      location: gym,
      history: [],
      now: TEST_NOW,
      duration: 'default',
    });
    const twice = 'Shortened rests toward the realistic minimum.';
    workout.explanation.reasons = [...workout.explanation.reasons, twice, twice];
    workout.explanation.fittingSteps = [twice, twice];
    workout.compromises = ['Runs about 4 min over 60 min.', 'Runs about 4 min over 60 min.'];
    const changed = 'Replaced Cable Fly with Pec Deck.';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderCard(workout, new Set(), {
        headline: 'Barbell + plates busy: 2 exercises replaced.',
        details: [changed, changed],
        counts: {
          added: 0,
          removed: 0,
          replaced: 2,
          adjusted: 0,
          supersetsAdded: 0,
          supersetsRemoved: 0,
          setsTrimmed: 0,
        },
      });
      expect(screen.getAllByText(twice)).toHaveLength(4);
      expect(screen.getAllByText(changed)).toHaveLength(2);
      expect(screen.getAllByText('Runs about 4 min over 60 min.')).toHaveLength(2);
      expect(errors.mock.calls.filter((call) => String(call[0]).includes('same key'))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });
});

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

describe('today’s priority muscles (the owner, 2026-11-01)', () => {
  /** A lower day: its session trains neither the biceps nor the triceps that lead the week. */
  const lowerDayCard = () =>
    generateWorkout({
      profile: { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      location: gym,
      history: [],
      now: TEST_NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
  const chipsShown = () =>
    Array.from(screen.getByLabelText('Muscle priorities').children).map((chip) => chip.textContent);
  const lineShown = () => screen.getByText(/^Priority muscles today: /).textContent;

  it('reads the line from the plan on the screen, never the text a copy saved before holds', () => {
    // The review: a copy, or a session, saved before this fix holds the week's top three. Shown,
    // the line is read from the plan and agrees with the chips.
    const workout = lowerDayCard();
    workout.explanation.reasons = workout.explanation.reasons.map((reason) =>
      reason.startsWith('Priority muscles today: ')
        ? 'Priority muscles today: Biceps: goal priority; Triceps: goal priority; Chest: not trained yet this cycle.'
        : reason,
    );
    renderCard(workout, new Set());
    expect(lineShown()).toMatch(
      /^Priority muscles today: Glutes: [^;]+; Hamstrings: [^;]+; Quads: /,
    );
    expect(screen.queryByText(/Biceps: goal priority/)).toBeNull();
    expect(chipsShown()).toEqual(['Glutes', 'Hamstrings', 'Quads', 'Abs']);
  });

  it('takes off a muscle whose sets were all skipped, the chips and the line alike', () => {
    const workout = lowerDayCard();
    const skipped = new Set(
      allEntries(workout.blocks)
        .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes('hamstrings'))
        .flatMap((entry) =>
          entry.sets
            .filter((set) => set.kind === 'working')
            .map((set) => `${entry.id}:${set.index}`),
        ),
    );
    expect(skipped.size).toBeGreaterThan(0);
    const handle = createTestStore();
    render(
      <Providers store={handle.store}>
        <WorkoutPreviewCard
          workout={workout}
          defaultEstimatedMinutes={60}
          location={gym}
          onSelect={() => undefined}
          onDurationChange={() => undefined}
          logged={new Set()}
          done={skipped}
          summary={null}
        />
      </Providers>,
    );
    expect(chipsShown()).not.toContain('Hamstrings');
    expect(lineShown()).not.toContain('Hamstrings');
    expect(lineShown()).toMatch(/^Priority muscles today: Glutes: [^;]+; Quads: /);
  });

  it('shows only the muscles the session trains, in the week’s order', () => {
    // Bigger arms as a goal: the biceps and triceps lead the week, and the lower day trains neither.
    const workout = generateWorkout({
      profile: { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      location: gym,
      history: [],
      now: TEST_NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    expect(workout.musclePriorities[0]?.muscle).toBe('biceps');
    renderCard(workout, new Set());
    const chips = screen.getByLabelText('Muscle priorities');
    expect(Array.from(chips.children).map((chip) => chip.textContent)).toEqual([
      'Glutes',
      'Hamstrings',
      'Quads',
      'Abs',
    ]);
  });
});
