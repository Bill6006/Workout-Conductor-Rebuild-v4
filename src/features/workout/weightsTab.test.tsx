import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { registerCustomExercises } from '../../catalog/exercises/catalog';
import {
  CustomExerciseSchema,
  customToCatalogExercise,
} from '../../core/validation/customExercise';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, createLocation } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import {
  PLATES_KEY,
  fitWeight,
  loadingFor,
  platesHere,
  specFor,
  type LoadingMap,
  type LoadingSpec,
} from '../../engine/loading/loading';
import type { WorkoutBlock, WorkoutEntry } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { PlaceWeights } from '../settings/PlaceWeights';
import { EntryPanels } from './EntryPanels';
import { LoadingEditor } from './LoadingEditor';

/**
 * Maintenance 30. Item 6: the tab is Plates on a bar and Weights on a machine's stack and on
 * dumbbells, and each place's weights can be set in Settings. Item 30: a machine that comes both
 * ways is set to its pin stack or to plates, and on plates its weight is the plates loaded on it.
 */

function panels(
  exerciseId: string,
  map: LoadingMap = {},
  weight: number | null = null,
  openRequest: { panel: 'plates'; at: number } | null = null,
) {
  const exercise = requireExercise(exerciseId);
  const entry = { id: 'entry-1', exerciseId } as unknown as WorkoutEntry;
  const block = { id: 'block-1', kind: 'straight' } as unknown as WorkoutBlock;
  return render(
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
      loading={loadingFor(map, { missingPlates: [] }, exercise, 'lb')}
      spec={specFor(map, exercise)}
      placeName="Gym"
      missingPlates={[]}
      onSaveLoading={vi.fn(() => Promise.resolve())}
      onSetMissingPlates={vi.fn(() => Promise.resolve())}
      openRequest={openRequest}
    />,
  );
}

describe('the Weights tab', () => {
  it('is Plates on a bar, and Weights on a machine’s stack and on dumbbells', () => {
    const names = ['barbell-bench-press', 'leg-curl', 'incline-dumbbell-press'].map((id) => {
      panels(id);
      const name = screen.getByTestId('plates-tab').textContent;
      document.body.innerHTML = '';
      return name;
    });
    expect(names).toEqual(['Plates', 'Weights', 'Weights']);
  });

  it('is Plates on a machine set to plates, whose weight is its plates with no bar', () => {
    panels('leg-press', { 'leg-press': { kind: 'plates', perSide: [45, 25, 10, 5] } }, 140);
    const tab = screen.getByTestId('plates-tab');
    expect(tab).toHaveTextContent('Plates');
    fireEvent.click(tab);
    const panel = screen.getByTestId('plate-math');
    expect(panel).toHaveTextContent('45, 25 each side · 140 lb');
    expect(panel).toHaveTextContent('The same on each side; the sled is not counted.');
    expect(within(panel).getByTestId('loading-editor')).toHaveAttribute(
      'data-kind',
      'machine-plates',
    );
  });

  it('is not there on a move with no load, a step-up’s bench being no machine', () => {
    panels('step-up');
    expect(screen.queryByTestId('plates-tab')).toBeNull();
  });

  it('on a move with no load holding a weight, shows the weight held and nothing to set', () => {
    for (const id of ['step-up', 'push-up']) {
      panels(id, {}, 20);
      const tab = screen.getByTestId('plates-tab');
      expect(tab).toHaveTextContent('Weights');
      fireEvent.click(tab);
      const panel = screen.getByTestId('plate-math');
      expect(panel).toHaveTextContent('Bodyweight plus 20 lb');
      expect(within(panel).queryByTestId('loading-editor')).toBeNull();
      document.body.innerHTML = '';
    }
  });
});

describe('the Weights panel asked open by the logger (the re-check)', () => {
  const asked = (openRequest: { panel: 'plates'; at: number } | null) => (
    <EntryPanels
      entry={{ id: 'entry-1', exerciseId: 'leg-press' } as unknown as WorkoutEntry}
      block={{ id: 'block-1', kind: 'straight' } as unknown as WorkoutBlock}
      exercise={requireExercise('leg-press')}
      units="lb"
      currentWeight={200}
      instruction={undefined}
      onSaveNotes={vi.fn(() => Promise.resolve())}
      onHowTo={vi.fn()}
      onOptions={vi.fn()}
      loading={loadingFor({}, { missingPlates: [] }, requireExercise('leg-press'), 'lb')}
      spec={null}
      placeName="Gym"
      missingPlates={[]}
      onSaveLoading={vi.fn(() => Promise.resolve())}
      onSetMissingPlates={vi.fn(() => Promise.resolve())}
      openRequest={openRequest}
    />
  );

  it('opens once, and stays closed through a render that builds the same ask again', () => {
    const view = render(asked(null));
    view.rerender(asked({ panel: 'plates', at: 1 }));
    expect(screen.getByTestId('plate-math')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('plates-tab'));
    expect(screen.queryByTestId('plate-math')).toBeNull();
    // A dial turn: the screen builds the same ask again, a new object.
    view.rerender(asked({ panel: 'plates', at: 1 }));
    expect(screen.queryByTestId('plate-math')).toBeNull();
    // A new tap of the hint opens it again.
    view.rerender(asked({ panel: 'plates', at: 2 }));
    expect(screen.getByTestId('plate-math')).toBeInTheDocument();
  });
});

describe('a move with no load, asked to open its Weights (the review)', () => {
  it('opens no empty panel with no tab to close it', () => {
    // The logger's hint asks the panel to open; with no weight and nothing to set, it stays shut.
    const view = panels('step-up');
    view.rerender(
      <EntryPanels
        entry={{ id: 'entry-1', exerciseId: 'step-up' } as unknown as WorkoutEntry}
        block={{ id: 'block-1', kind: 'straight' } as unknown as WorkoutBlock}
        exercise={requireExercise('step-up')}
        units="lb"
        currentWeight={null}
        instruction={undefined}
        onSaveNotes={vi.fn(() => Promise.resolve())}
        onHowTo={vi.fn()}
        onOptions={vi.fn()}
        loading={loadingFor({}, { missingPlates: [] }, requireExercise('step-up'), 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSaveLoading={vi.fn(() => Promise.resolve())}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
        openRequest={{ panel: 'plates', at: 1 }}
      />,
    );
    expect(screen.queryByTestId('plate-math')).toBeNull();
    expect(screen.queryByTestId('plates-tab')).toBeNull();
  });

  it('ignores the ask, and opens only when its tab is tapped once there is a weight', () => {
    const step = (weight: number | null, openRequest: { panel: 'plates'; at: number } | null) => (
      <EntryPanels
        entry={{ id: 'entry-1', exerciseId: 'step-up' } as unknown as WorkoutEntry}
        block={{ id: 'block-1', kind: 'straight' } as unknown as WorkoutBlock}
        exercise={requireExercise('step-up')}
        units="lb"
        currentWeight={weight}
        instruction={undefined}
        onSaveNotes={vi.fn(() => Promise.resolve())}
        onHowTo={vi.fn()}
        onOptions={vi.fn()}
        loading={loadingFor({}, { missingPlates: [] }, requireExercise('step-up'), 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSaveLoading={vi.fn(() => Promise.resolve())}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
        openRequest={openRequest}
      />
    );
    const request = { panel: 'plates' as const, at: 1 };
    const view = render(step(null, null));
    view.rerender(step(null, request));
    view.rerender(step(20, request));
    expect(screen.getByTestId('plates-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('plate-math')).toBeNull();
    fireEvent.click(screen.getByTestId('plates-tab'));
    expect(screen.getByTestId('plate-math')).toHaveTextContent('Bodyweight plus 20 lb');
    // The weight dialled back to nothing: the panel goes with its tab.
    view.rerender(step(null, request));
    expect(screen.queryByTestId('plate-math')).toBeNull();
    expect(screen.queryByTestId('plates-tab')).toBeNull();
  });

  it('opens on its weight held, once there is one', () => {
    panels('step-up', {}, 20);
    expect(screen.queryByTestId('plate-math')).toBeNull();
    fireEvent.click(screen.getByTestId('plates-tab'));
    expect(screen.getByTestId('plate-math')).toHaveTextContent('Bodyweight plus 20 lb');
    expect(screen.getByTestId('plate-math')).toHaveTextContent(
      'Held or worn, on top of your own weight.',
    );
  });
});

describe('a stack an older copy saved for a step-up (the review)', () => {
  it('no longer narrows the weight held, and the step is a weight held’s', () => {
    const stepUp = requireExercise('step-up');
    const map: LoadingMap = {
      'step-up': { kind: 'stack', ranges: [{ from: 10, to: 200, step: 10 }] },
    };
    expect(specFor(map, stepUp)).toBeNull();
    const loading = loadingFor(map, undefined, stepUp, 'lb');
    expect(loading.available).toBeNull();
    expect(loading.step).toBe(5);
    expect(fitWeight(25, loading)).toBe(25);
  });
});

describe('the plates for a weight here', () => {
  it('reads a weight on a step-up as held, never as a pin', () => {
    const stepUp = requireExercise('step-up');
    expect(platesHere(stepUp, 20, 'lb', { perSide: null }, null).line).toBe(
      'Bodyweight plus 20 lb',
    );
    const curl = requireExercise('leg-curl');
    expect(platesHere(curl, 90, 'lb', { perSide: null }, null).line).toBe('Pin the stack at 90 lb');
  });

  it('reads a band as band tension, never as bodyweight plus a load (the review)', () => {
    const band = requireExercise('band-row');
    expect(platesHere(band, 20, 'lb', { perSide: null }, null).line).toBe(
      'Band tension; note the band colour',
    );
  });

  it('says what plates a machine’s rack cannot make', () => {
    const press = requireExercise('leg-press');
    const spec: LoadingSpec = { kind: 'plates', perSide: [45, 25] };
    const result = platesHere(press, 105, 'lb', { perSide: [45, 25] }, spec);
    expect(result.kind).toBe('machine-plates');
    expect(result.line).toBe('The plates here make 100 or 140, not 105 lb');
  });
});

/** The editor under a parent that keeps what it saves, as the place does. */
function Kept({
  exerciseId,
  initial,
  rack,
  onSave,
  today = true,
}: {
  exerciseId: string;
  initial: LoadingSpec | null;
  rack?: number[];
  onSave: (spec: LoadingSpec | null) => void;
  today?: boolean;
}) {
  const exercise = requireExercise(exerciseId);
  const [spec, setSpec] = useState<LoadingSpec | null>(initial);
  const map: LoadingMap = {
    ...(rack ? { [PLATES_KEY]: { kind: 'plates', perSide: rack } } : {}),
    ...(spec ? { [exerciseId]: spec } : {}),
  };
  return (
    <LoadingEditor
      exercise={exercise}
      units="lb"
      loading={loadingFor(map, { missingPlates: [] }, exercise, 'lb')}
      spec={spec}
      placeName="Gym"
      missingPlates={[]}
      onSave={(next) => {
        onSave(next);
        setSpec(next);
        return Promise.resolve();
      }}
      onSetMissingPlates={vi.fn(() => Promise.resolve())}
      placeLoading={map}
      today={today}
    />
  );
}

afterEach(() => registerCustomExercises([]));

describe('the hand weights named for the place (the re-check)', () => {
  it('names the one record dumbbells and kettlebells share, on a kettlebell lift at the gym', () => {
    const swing = requireExercise('kettlebell-swing');
    render(
      <LoadingEditor
        exercise={swing}
        units="lb"
        loading={loadingFor({}, { missingPlates: [] }, swing, 'lb')}
        spec={{ kind: 'dumbbells', ranges: [{ from: 18, to: 72, step: 9 }] }}
        placeName="Gym"
        missingPlates={[]}
        onSave={vi.fn(() => Promise.resolve())}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
        hand="both"
      />,
    );
    expect(screen.getByTestId('loading-editor')).toHaveTextContent(
      'Dumbbells and kettlebells at Gym',
    );
    expect(screen.getByTestId('loading-summary')).toHaveTextContent(
      'Dumbbells and kettlebells: 18 to 72 by 9 lb.',
    );
  });

  it('names a kettlebell-only place’s record as kettlebells, on any lift there', () => {
    const goblet = requireExercise('goblet-squat');
    render(
      <LoadingEditor
        exercise={goblet}
        units="lb"
        loading={loadingFor({}, { missingPlates: [] }, goblet, 'lb')}
        spec={{ kind: 'dumbbells', ranges: [{ from: 18, to: 72, step: 9 }] }}
        placeName="Garage"
        missingPlates={[]}
        onSave={vi.fn(() => Promise.resolve())}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
        hand="kettlebells"
      />,
    );
    expect(screen.getByTestId('loading-editor')).toHaveTextContent('Kettlebells at Garage');
    expect(screen.getByTestId('loading-summary')).toHaveTextContent(
      'Kettlebells: 18 to 72 by 9 lb.',
    );
    expect(screen.getByTestId('loading-editor')).not.toHaveTextContent('Dumbbells');
  });
});

describe('a machine that comes both ways', () => {
  it('offers its pin stack or plates, the stack first; a cable station and a pec deck have a stack only', () => {
    render(<Kept exerciseId="leg-press-calf-raise" initial={null} onSave={vi.fn()} />);
    const choice = screen.getByRole('group', { name: 'How this machine is loaded at Gym' });
    expect(
      within(choice)
        .getAllByRole('button')
        .map((button) => [button.textContent, button.getAttribute('aria-pressed')]),
    ).toEqual([
      ['Pin stack', 'true'],
      ['Plates', 'false'],
    ]);
    document.body.innerHTML = '';
    for (const id of ['seated-cable-row', 'pec-deck', 'cable-triceps-pushdown']) {
      render(<Kept exerciseId={id} initial={null} onSave={vi.fn()} />);
      expect(screen.queryByTestId('machine-load')).toBeNull();
      document.body.innerHTML = '';
    }
  });

  it('on plates starts from the plates the place keeps, and edits them as its own', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <Kept exerciseId="leg-press-calf-raise" initial={null} rack={[45, 25, 10]} onSave={onSave} />,
    );
    await user.click(screen.getByTestId('machine-load-plates'));
    expect(onSave).toHaveBeenLastCalledWith({ kind: 'plates', perSide: [45, 25, 10] });
    expect(screen.getByTestId('machine-plates-note')).toHaveTextContent(
      'Its weight is the plates loaded on it, the same on each side; the sled is not counted.',
    );
    expect(screen.getByTestId('loading-note')).toHaveTextContent('This machine moves by 20 lb.');
    // Default changes this machine's plates, saved as its own even with every size on.
    await user.click(screen.getByTestId('plates-mode-default'));
    await user.click(screen.getByTestId('plate-5'));
    expect(onSave).toHaveBeenLastCalledWith({ kind: 'plates', perSide: [45, 25, 10, 5] });
    await user.click(screen.getByTestId('plate-35'));
    await user.click(screen.getByTestId('plate-2.5'));
    expect(onSave).toHaveBeenLastCalledWith({
      kind: 'plates',
      perSide: [45, 35, 25, 10, 5, 2.5],
    });
  });

  it('back on its pin stack gets the stack it had before the switch', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const stack: LoadingSpec = { kind: 'stack', ranges: [{ from: 20, to: 300, step: 20 }] };
    render(<Kept exerciseId="leg-press-calf-raise" initial={stack} onSave={onSave} />);
    expect(screen.getByTestId('loading-summary')).toHaveTextContent('Stack: 20 to 300 by 20 lb.');
    await user.click(screen.getByTestId('machine-load-plates'));
    // Its record keeps the stack, for a switch back on any day, not only in this visit.
    expect(onSave).toHaveBeenLastCalledWith({
      kind: 'plates',
      perSide: [45, 35, 25, 10, 5, 2.5],
      stack: stack.ranges,
    });
    await user.click(screen.getByTestId('machine-load-stack'));
    expect(onSave).toHaveBeenLastCalledWith(stack);
    expect(screen.getByTestId('loading-summary')).toHaveTextContent('Stack: 20 to 300 by 20 lb.');
  });

  it('gets back a stack set in the same visit, after a switch to plates and back', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Kept exerciseId="leg-press" initial={null} onSave={onSave} />);
    await user.click(screen.getByTestId('loading-edit'));
    await user.clear(screen.getByLabelText('Lightest'));
    await user.type(screen.getByLabelText('Lightest'), '50');
    await user.clear(screen.getByLabelText('Heaviest'));
    await user.type(screen.getByLabelText('Heaviest'), '400');
    await user.clear(screen.getByLabelText('Jump'));
    await user.type(screen.getByLabelText('Jump'), '25');
    await user.click(screen.getByTestId('loading-save'));
    const stack: LoadingSpec = { kind: 'stack', ranges: [{ from: 50, to: 400, step: 25 }] };
    expect(onSave).toHaveBeenLastCalledWith(stack);
    await user.click(screen.getByTestId('machine-load-plates'));
    await user.click(screen.getByTestId('machine-load-stack'));
    expect(onSave).toHaveBeenLastCalledWith(stack);
  });

  it('keeps its pin stack through a change of its plates', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const stack = [{ from: 20, to: 300, step: 20 }];
    render(
      <Kept
        exerciseId="leg-press"
        initial={{ kind: 'plates', perSide: [45, 25, 10], stack }}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByTestId('plates-mode-default'));
    await user.click(screen.getByTestId('plate-5'));
    expect(onSave).toHaveBeenLastCalledWith({ kind: 'plates', perSide: [45, 25, 10, 5], stack });
  });

  it('puts every plate back on its own record with All plates', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <Kept
        exerciseId="leg-press"
        initial={{ kind: 'plates', perSide: [45, 25] }}
        onSave={onSave}
        today={false}
      />,
    );
    await user.click(screen.getByTestId('rack-all'));
    expect(onSave).toHaveBeenLastCalledWith({
      kind: 'plates',
      perSide: [45, 35, 25, 10, 5, 2.5],
    });
    // Still on plates: the record is what says so.
    expect(screen.getByTestId('machine-load-plates')).toHaveAttribute('aria-pressed', 'true');
  });

  it('is offered on a machine of the lifter’s own, who knows how theirs loads (the re-check)', () => {
    const now = '2026-09-18T12:00:00.000Z';
    const hack = requireExercise('hack-squat');
    const own = customToCatalogExercise(
      CustomExerciseSchema.parse({
        id: 'custom-freemotion-squat',
        custom: true,
        name: 'Freemotion Squat',
        aliases: ['Freemotion Plate Squat'],
        primaryMuscles: [...hack.primaryMuscles],
        movementPattern: hack.movementPattern,
        equipment: [['hack-squat']],
        load: 'stack',
        createdAt: now,
        updatedAt: now,
      }),
    );
    registerCustomExercises([own]);
    render(
      <LoadingEditor
        exercise={own}
        units="lb"
        loading={loadingFor({}, { missingPlates: [] }, own, 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSave={vi.fn(() => Promise.resolve())}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
      />,
    );
    expect(screen.getByTestId('machine-load')).toBeInTheDocument();
  });

  it('says so when a switch cannot be saved (the review)', async () => {
    const user = userEvent.setup();
    const exercise = requireExercise('leg-press');
    render(
      <LoadingEditor
        exercise={exercise}
        units="lb"
        loading={loadingFor({}, { missingPlates: [] }, exercise, 'lb')}
        spec={null}
        placeName="Gym"
        missingPlates={[]}
        onSave={() => Promise.reject(new Error('Pick a place on Today first.'))}
        onSetMissingPlates={vi.fn(() => Promise.resolve())}
      />,
    );
    await user.click(screen.getByTestId('machine-load-plates'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a place on Today first.');
  });

  it('with no stack set before, goes back to none', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Kept exerciseId="leg-press" initial={null} onSave={onSave} />);
    await user.click(screen.getByTestId('machine-load-plates'));
    await user.click(screen.getByTestId('machine-load-stack'));
    expect(onSave).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId('loading-summary')).toHaveTextContent('Not set yet');
  });
});

describe('the weights at each place, in Settings', () => {
  async function opened() {
    const handle = createTestStore();
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.setCurrentLocation('gym');
    // The provider reads the device again on mount: done before any tap, as on a phone.
    const hydrate = vi.spyOn(store, 'hydrate');
    render(
      <Providers store={store}>
        <PlaceWeights />
      </Providers>,
    );
    await act(async () => {
      await hydrate.mock.results[0]?.value;
    });
    return store;
  }
  const gymLoading = (store: Awaited<ReturnType<typeof opened>>) =>
    store.getSnapshot().locations.find((place) => place.id === 'gym')?.loading ?? {};

  it('shows the place’s plates, dumbbells and machines, saving each for that place only', async () => {
    const user = userEvent.setup();
    const store = await opened();
    const plates = screen.getByTestId('place-weights-plates');
    // What the place keeps, never what is missing for one workout.
    expect(within(plates).queryByTestId('plates-mode-today')).toBeNull();
    expect(within(plates).getByTestId('plates-mode-hint')).toHaveTextContent('Plates at Gym');
    await user.click(within(plates).getByTestId('plate-35'));
    await waitFor(() =>
      expect(gymLoading(store)[PLATES_KEY]).toEqual({
        kind: 'plates',
        perSide: [45, 25, 10, 5, 2.5],
      }),
    );
    expect(
      within(screen.getByTestId('place-weights-dumbbells')).getByTestId('loading-edit'),
    ).toHaveTextContent('Set my dumbbells');

    const machine = screen.getByTestId('place-weights-machine') as HTMLSelectElement;
    const names = [...machine.options].map((option) => option.textContent);
    expect(names).toContain('Leg Press Calf Raise');
    expect(names).not.toContain('Step-Up');
    expect(names).not.toContain('Bench Dip');
    await user.selectOptions(machine, 'leg-press-calf-raise');
    const machines = screen.getByTestId('place-weights-machines');
    await user.click(within(machines).getByTestId('machine-load-plates'));
    // Plates from the gym's own rack, as just set: no 35.
    await waitFor(() =>
      expect(gymLoading(store)['leg-press-calf-raise']).toEqual({
        kind: 'plates',
        perSide: [45, 25, 10, 5, 2.5],
      }),
    );
  });

  it('switches every exercise done on the machine, and each gets its own stack back, any day', async () => {
    const user = userEvent.setup();
    const press: LoadingSpec = { kind: 'stack', ranges: [{ from: 50, to: 500, step: 25 }] };
    const calf: LoadingSpec = { kind: 'stack', ranges: [{ from: 20, to: 300, step: 20 }] };
    const store = await opened();
    await store.saveLoading('gym', 'leg-press', press);
    await store.saveLoading('gym', 'leg-press-calf-raise', calf);
    const machine = screen.getByTestId('place-weights-machine') as HTMLSelectElement;
    const machines = screen.getByTestId('place-weights-machines');
    await user.selectOptions(machine, 'leg-press-calf-raise');
    await user.click(within(machines).getByTestId('machine-load-plates'));
    // The leg press and the calf raise done on it are one machine: both on plates, each keeping
    // its own stack in its record.
    await waitFor(() =>
      expect(gymLoading(store)['leg-press']).toEqual({
        kind: 'plates',
        perSide: [45, 35, 25, 10, 5, 2.5],
        stack: press.ranges,
      }),
    );
    expect(gymLoading(store)['leg-press-calf-raise']).toEqual({
      kind: 'plates',
      perSide: [45, 35, 25, 10, 5, 2.5],
      stack: calf.ranges,
    });
    // Another machine looked at, the leg press picked: a fresh editor, the switch on Plates.
    await user.selectOptions(machine, 'hack-squat');
    await user.selectOptions(machine, 'leg-press');
    expect(within(machines).getByTestId('machine-load-plates')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(machines).getByTestId('machine-load-stack'));
    await waitFor(() => expect(gymLoading(store)['leg-press']).toEqual(press));
    expect(gymLoading(store)['leg-press-calf-raise']).toEqual(calf);
  });

  it('changes the plates of the whole machine, each record keeping its own stack (the re-check)', async () => {
    const user = userEvent.setup();
    const calf: LoadingSpec = { kind: 'stack', ranges: [{ from: 20, to: 300, step: 20 }] };
    const store = await opened();
    await store.saveLoading('gym', 'leg-press-calf-raise', calf);
    const machine = screen.getByTestId('place-weights-machine') as HTMLSelectElement;
    const machines = screen.getByTestId('place-weights-machines');
    await user.selectOptions(machine, 'leg-press');
    await user.click(within(machines).getByTestId('machine-load-plates'));
    await waitFor(() => expect(gymLoading(store)['leg-press']?.kind).toBe('plates'));
    // The leg press has no 35s: nor has the calf raise done on it.
    await user.click(within(machines).getByTestId('plate-35'));
    await waitFor(() =>
      expect(gymLoading(store)['leg-press']).toEqual({
        kind: 'plates',
        perSide: [45, 25, 10, 5, 2.5],
      }),
    );
    expect(gymLoading(store)['leg-press-calf-raise']).toEqual({
      kind: 'plates',
      perSide: [45, 25, 10, 5, 2.5],
      stack: calf.ranges,
    });
  });

  it('names both where a place has dumbbells and kettlebells, as they share one record', async () => {
    const user = userEvent.setup();
    const store = await opened();
    await store.saveLocation(
      createLocation(
        { id: 'garage', name: 'Garage', kind: 'custom', equipment: ['kettlebells', 'dumbbells'] },
        TEST_NOW,
      ),
    );
    await user.click(screen.getByRole('radio', { name: 'Garage' }));
    const section = screen.getByTestId('place-weights-dumbbells');
    expect(within(section).getByRole('heading')).toHaveTextContent('Dumbbells and kettlebells');
    expect(section).toHaveTextContent('Dumbbells and kettlebells at Garage');
    expect(within(section).getByTestId('loading-edit')).toHaveTextContent(
      'Set my dumbbells and kettlebells',
    );
  });

  it('names a place’s kettlebells as such, with no dumbbells there (the review)', async () => {
    const user = userEvent.setup();
    const store = await opened();
    await store.saveLocation(
      createLocation(
        { id: 'garage', name: 'Garage', kind: 'custom', equipment: ['kettlebells'] },
        TEST_NOW,
      ),
    );
    await user.click(screen.getByRole('radio', { name: 'Garage' }));
    const section = screen.getByTestId('place-weights-dumbbells');
    expect(section).toHaveTextContent('Kettlebells');
    expect(section).toHaveTextContent('Kettlebells at Garage');
    expect(within(section).getByTestId('loading-edit')).toHaveTextContent('Set my kettlebells');
    expect(screen.getByTestId('place-weights')).not.toHaveTextContent('Dumbbells');
  });

  it('at Home shows its dumbbells only: a reverse curl or a face pull done there puts no bar or stack in', async () => {
    const user = userEvent.setup();
    await opened();
    await user.click(screen.getByRole('radio', { name: 'Home' }));
    expect(screen.queryByTestId('place-weights-plates')).toBeNull();
    expect(screen.queryByTestId('place-weights-machines')).toBeNull();
    expect(
      within(screen.getByTestId('place-weights-dumbbells')).getByTestId('loading-editor'),
    ).toHaveTextContent('Dumbbells at Home');
  });
});
