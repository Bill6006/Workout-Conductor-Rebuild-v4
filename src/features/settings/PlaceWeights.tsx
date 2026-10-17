import { useState } from 'react';
import { allExercises } from '../../catalog/exercises/catalog';
import { loadOfGroup } from '../../catalog/exercises/define';
import { CUSTOM_ID_PREFIX } from '../../core/validation/customExercise';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { ChoiceGroup } from '../../components/Form/ChoiceGroup';
import formStyles from '../../components/Form/Form.module.css';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import {
  DUMBBELLS_KEY,
  PLATES_KEY,
  loadingFor,
  HAND_NAMES,
  handWeightsAt,
  loadingKeyFor,
  specFor,
} from '../../engine/loading/loading';
import { hasNoLoad } from '../../engine/progression/startingLoad';
import { LoadingEditor } from '../workout/LoadingEditor';
import styles from './Settings.module.css';

const NO_PLATES_MISSING: readonly number[] = [];
const nothingMissingToday = async () => undefined;

/**
 * What each place can load, set here as well as from a workout's Weights tab (Maintenance 30, the
 * owner's item 6): the plates on its rack, its dumbbells, and each machine, its pin stack or, on a
 * machine that comes both ways, its plates (item 30). Each change is saved for that place at once;
 * a plate missing for one workout only stays the workout's to mark.
 */
export function PlaceWeights() {
  const store = useAppStore();
  const { locations, profile } = useAppState();
  const units = profile?.units ?? 'lb';
  const [placeId, setPlaceId] = useState<string>(
    () => profile?.currentLocationId ?? locations[0]?.id ?? '',
  );
  const [machineId, setMachineId] = useState('');
  const place = locations.find((candidate) => candidate.id === placeId) ?? locations[0];
  if (!place) {
    return (
      <p className={styles.body} data-testid="place-weights">
        No place is saved yet.
      </p>
    );
  }

  const equipment = new Set(place.equipment);
  // A move takes its own load here only through equipment that gives that load: a reverse curl
  // done with dumbbells at home puts no bar there, a face pull with a band no pin stack. A lifter's
  // own move is done the one way it was saved, its chips in any order (the fifth re-check).
  const loadedHere = allExercises()
    .filter((exercise) =>
      exercise.equipment.some(
        (group) =>
          group.every((id) => equipment.has(id)) &&
          (exercise.id.startsWith(CUSTOM_ID_PREFIX) || loadOfGroup(group) === exercise.load),
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  // One lift stands for the plates on the rack and one for the dumbbells: they are the place's own.
  const bar = loadedHere.find((exercise) => loadingKeyFor(exercise) === PLATES_KEY);
  const dumbbells = loadedHere.find((exercise) => loadingKeyFor(exercise) === DUMBBELLS_KEY);
  const machines = loadedHere.filter(
    (exercise) => exercise.load === 'stack' && !hasNoLoad(exercise),
  );
  const machine = machines.find((candidate) => candidate.id === machineId) ?? machines[0];
  // The dumbbells' record covers the kettlebells too: named for what the place has.
  const hand = handWeightsAt(equipment) ?? 'dumbbells';

  const editorFor = (exercise: CatalogExercise) => (
    <LoadingEditor
      key={`${place.id}:${exercise.id}`}
      exercise={exercise}
      units={units}
      loading={loadingFor(place.loading, undefined, exercise, units)}
      spec={specFor(place.loading, exercise)}
      placeName={place.name}
      missingPlates={NO_PLATES_MISSING}
      onSave={(spec) => store.saveLoading(place.id, loadingKeyFor(exercise), spec)}
      onSetMissingPlates={nothingMissingToday}
      today={false}
      placeLoading={place.loading}
      onSaveMachine={(specs) => store.saveLoadings(place.id, specs)}
      hand={hand}
    />
  );

  return (
    <div data-testid="place-weights">
      {locations.length > 1 ? (
        <ChoiceGroup
          label="Place"
          value={place.id}
          options={locations.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
          onChange={(value) => {
            setPlaceId(value);
            setMachineId('');
          }}
        />
      ) : null}
      {bar ? (
        <section data-testid="place-weights-plates">
          <h3 className={styles.subheading}>Plates</h3>
          {editorFor(bar)}
        </section>
      ) : null}
      {dumbbells ? (
        <section data-testid="place-weights-dumbbells">
          <h3 className={styles.subheading}>{HAND_NAMES[hand].many}</h3>
          {editorFor(dumbbells)}
        </section>
      ) : null}
      {machine ? (
        <section data-testid="place-weights-machines">
          <h3 className={styles.subheading}>Machines</h3>
          <label className={formStyles.label} htmlFor="place-weights-machine">
            Machine
          </label>
          <select
            id="place-weights-machine"
            className={formStyles.input}
            value={machine.id}
            onChange={(event) => setMachineId(event.target.value)}
            data-testid="place-weights-machine"
          >
            {machines.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          {editorFor(machine)}
        </section>
      ) : null}
      {!bar && !dumbbells && !machine ? (
        <p className={styles.body}>Nothing at {place.name} takes a weight to set.</p>
      ) : null}
    </div>
  );
}
