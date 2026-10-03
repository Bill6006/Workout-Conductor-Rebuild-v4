import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { workoutSequence } from '../../engine/workout/sequence';
import { DUMBBELLS_KEY } from '../../engine/loading/loading';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { ExerciseCard } from './ExerciseCard';

// The card is presentational; the user's own media comes from the store in the app.
vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));

const NOW = '2026-09-03T14:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
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

  // Maintenance 25, item 7: only the exercise under way plays its clip on the workout; the other
  // cards show their still, so a session never downloads every clip at once.
  it('plays the clip only on the card of the exercise under way', async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url);
        return { ok: true, status: 200, blob: async () => new Blob(['mp4']) };
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:clip');
    URL.revokeObjectURL = vi.fn();
    try {
      const [second] = allEntries(workout.blocks).slice(1);
      const card = (current: boolean) => (
        <ExerciseCard
          entry={entry}
          block={block}
          units="lb"
          position={
            workoutSequence(workout).find(
              (item) => item.entryId === (current ? entry.id : second?.id),
            ) ?? null
          }
          logged={[]}
          previous={null}
          availableEquipment={new Set(gym?.equipment ?? [])}
        >
          <div>rows</div>
        </ExerciseCard>
      );
      const { rerender } = render(card(false));
      expect(screen.getByTestId('exercise-thumb').getAttribute('src')).toMatch(/\.webp$/);
      expect(fetched).toEqual([]);
      rerender(card(true));
      await waitFor(() => expect(screen.getByTestId('exercise-thumb').tagName).toBe('VIDEO'));
      expect(fetched).toEqual([
        expect.stringMatching(/media\/exercises\/[a-z-]+\.[0-9a-f]{8}\.mp4$/),
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('says what X means once, in the reason itself', async () => {
    // Maintenance 23, the owner's item 27: "drive up as fast as you can; X is as fast as you can".
    const user = userEvent.setup();
    expect(entry.role).toBe('primary-strength');
    render(
      <ExerciseCard
        entry={entry}
        block={block}
        units="lb"
        position={null}
        logged={[]}
        previous={null}
        availableEquipment={new Set(gym?.equipment ?? [])}
        onShowDetail={vi.fn()}
      >
        <div>rows</div>
      </ExerciseCard>,
    );
    await user.click(screen.getByTestId('tempo-line'));
    const tempo = screen
      .getAllByRole('term')
      .find((term) => term.textContent === 'Tempo')?.nextElementSibling;
    expect(tempo?.textContent).toMatch(/^\d-\d-X-\d · /);
    expect(tempo?.textContent?.match(/as fast as you can/g)).toHaveLength(1);
    expect(screen.getByTestId('tempo-detail')).not.toHaveTextContent('X is as fast as you can');
  });
});

describe('ExerciseCard for sets the place changed', () => {
  /** The card for one exercise of a plan, its tempo details open. */
  async function cardFor(
    templateId: string,
    exerciseId: string,
    top: number | null,
    extra: { from: number; to: number; step: number }[] = [],
  ) {
    if (!home) throw new Error('no home');
    const place =
      top === null
        ? home
        : {
            ...home,
            loading: {
              [DUMBBELLS_KEY]: {
                kind: 'dumbbells' as const,
                ranges: [{ from: 5, to: top, step: 5 }, ...extra],
              },
            },
          };
    const plan = generateWorkout({
      profile: { ...profile, bodyweight: 185 },
      location: place,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId },
    });
    const holder = plan.blocks.find((candidate) =>
      candidate.entries.some((item) => item.exerciseId === exerciseId),
    );
    const item = holder?.entries.find((candidate) => candidate.exerciseId === exerciseId);
    if (!holder || !item) throw new Error(`no ${exerciseId}`);
    const user = userEvent.setup();
    const view = render(
      <ExerciseCard
        entry={item}
        block={holder}
        units="lb"
        position={null}
        logged={[]}
        previous={null}
        availableEquipment={new Set(place.equipment)}
        onShowDetail={vi.fn()}
      >
        <div>rows</div>
      </ExerciseCard>,
    );
    await user.click(screen.getByTestId('tempo-line'));
    return { view, item };
  }

  it('keeps a set run to its effort at its own tempo, a strength set too', async () => {
    // Maintenance 23: at the heaviest weight a slower tempo adds effort; the reps already do. Since
    // Maintenance 25 a strength set well short runs to its effort as well, at its own tempo.
    const { view, item } = await cardFor('push-arms', 'incline-dumbbell-press', 20);
    expect(item.progression?.capped).toEqual({ at: 20 });
    expect(screen.getByTestId('tempo-line')).toHaveTextContent('3-0-1-0');
    view.unmount();
    const bench = await cardFor('push-arms', 'dumbbell-bench-press', 20);
    expect(bench.item.progression?.capped).toEqual({ at: 20 });
    expect(screen.getByTestId('tempo-line')).toHaveTextContent('2-1-X-0');
  });

  it('keeps the slower tempo for a strength set held at the heaviest weight, not well short', async () => {
    // The bench asks 40 lb; dumbbells to 37.5 are within a tenth of that, so the reps go up two
    // and the tempo adds the rest of the effort (Maintenance 21).
    const { item } = await cardFor('push-arms', 'dumbbell-bench-press', 35, [
      { from: 37.5, to: 37.5, step: 2.5 },
    ]);
    expect(item.progression?.capped).toEqual({ at: 37.5 });
    expect(screen.getByTestId('tempo-line')).toHaveTextContent('3-1-X-0');
  });

  it('tells a core stability move to stop before the form slips', async () => {
    await cardFor('lower', 'dead-bug', null);
    expect(screen.getByTestId('tempo-detail')).toHaveTextContent(
      'stop 2 clean reps short, before your form slips',
    );
  });
});
