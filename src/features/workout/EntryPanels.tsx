import { useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { CustomInstruction } from '../../core/validation/customExercise';
import type { UnitSystem } from '../../core/validation/profile';
import {
  onPlates,
  platesHere,
  type HandWeights,
  type Loading,
  type LoadingMap,
  type LoadingSpec,
} from '../../engine/loading/loading';
import { hasNoLoad } from '../../engine/progression/startingLoad';
import type { WorkoutBlock, WorkoutEntry } from '../../engine/workout/types';
import styles from './ActiveWorkout.module.css';
import { LoadingEditor } from './LoadingEditor';
import { PlateStack } from '../../components/PlateStack/PlateStack';

export interface EntryPanelsProps {
  entry: WorkoutEntry;
  block: WorkoutBlock;
  exercise: CatalogExercise;
  units: UnitSystem;
  /** Weight the logger currently shows, for Plate Math. */
  currentWeight: number | null;
  instruction: CustomInstruction | undefined;
  onSaveNotes: (notes: string, cues: string[]) => Promise<void>;
  /** Opens How to: the demonstration and the steps, in a sheet (Maintenance 25, item 7). */
  onHowTo: () => void;
  onOptions: () => void;
  /** What this place can load for the exercise today, and the record behind it. */
  loading: Loading;
  spec: LoadingSpec | null;
  /** The place's loading records: its rack, and the other exercises done on the same machine. */
  placeLoading?: LoadingMap;
  placeName: string;
  missingPlates: readonly number[];
  onSaveLoading: (spec: LoadingSpec | null) => Promise<void>;
  /** Saves several of the place's records at once: a machine's switch (Maintenance 30, item 30). */
  onSaveMachine?: (specs: Readonly<Record<string, LoadingSpec | null>>) => Promise<void>;
  /** What the place holds in the hand, which its dumbbells' record covers. */
  hand?: HandWeights;
  onSetMissingPlates: (plates: number[]) => Promise<void>;
  /** Asks the Plates panel to open; a new `at` opens it again. */
  openRequest?: { panel: 'plates'; at: number } | null;
}

type Panel = 'notes' | 'plates' | null;

/**
 * Compact expandable panels under the current exercise: per-exercise notes and cue memory and
 * Plate Math, with How to and the options sheet beside them. How to opens its own sheet, so the
 * card never grows by the demonstration. Nothing here scrolls the whole screen away from the set.
 */
export function EntryPanels({
  entry,
  block,
  exercise,
  units,
  currentWeight,
  instruction,
  onSaveNotes,
  onHowTo,
  onOptions,
  loading,
  spec,
  placeLoading,
  placeName,
  missingPlates,
  onSaveLoading,
  onSaveMachine,
  hand,
  onSetMissingPlates,
  openRequest = null,
}: EntryPanelsProps) {
  const [open, setOpen] = useState<Panel>(null);
  const [notes, setNotes] = useState(instruction?.notes ?? '');
  const [cues, setCues] = useState((instruction?.cues ?? []).join('\n'));
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const plates =
    currentWeight !== null && currentWeight > 0
      ? platesHere(exercise, currentWeight, units, loading, spec)
      : null;

  // The place's weights can be set on any lift that takes a load, with or without a weight showing:
  // the one test for "no weight" (Maintenance 21), so a step-up or a bench dip has none.
  const canLoad = !hasNoLoad(exercise);
  // Plates on a bar, or on a machine set to them; Weights on a stack and on dumbbells (Maintenance
  // 30, the owner's items 6 and 30).
  const tabName = onPlates(exercise, spec) ? 'Plates' : 'Weights';
  // The tab, and its panel, only where there is something to show: a weight, or one to set.
  const weightsTab = plates !== null || canLoad;

  // A new request opens its panel once: told apart by when it was made, not by the object, which
  // the screen builds again at each render. Comparing during render keeps setState out of an effect.
  const [handledAt, setHandledAt] = useState(openRequest?.at ?? null);
  if ((openRequest?.at ?? null) !== handledAt) {
    setHandledAt(openRequest?.at ?? null);
    if (openRequest && weightsTab) setOpen(openRequest.panel);
  }

  const toggle = (panel: Panel) => setOpen((current) => (current === panel ? null : panel));

  const save = async () => {
    setSaved('saving');
    try {
      await onSaveNotes(
        notes,
        cues
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      );
      setSaved('saved');
    } catch {
      setSaved('error');
    }
  };

  return (
    <div className={styles.panels}>
      <div className={styles.panelTabs}>
        <div className={styles.tabGroup}>
          <button
            type="button"
            className={styles.panelTab}
            onClick={onHowTo}
            aria-haspopup="dialog"
            data-testid="howto-button"
          >
            How to
          </button>
          <div className={styles.tabGroup} role="tablist" aria-label="Exercise panels">
            <button
              type="button"
              role="tab"
              aria-selected={open === 'notes'}
              className={styles.panelTab}
              onClick={() => toggle('notes')}
              data-testid="notes-tab"
            >
              Notes{instruction && (instruction.notes || instruction.cues.length > 0) ? ' •' : ''}
            </button>
            {weightsTab ? (
              <button
                type="button"
                role="tab"
                aria-selected={open === 'plates'}
                className={styles.panelTab}
                onClick={() => toggle('plates')}
                data-testid="plates-tab"
              >
                {tabName}
              </button>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className={styles.panelTab}
          onClick={onOptions}
          data-testid="options-tab"
        >
          Options
        </button>
      </div>

      {open === 'notes' ? (
        <div className={styles.panelBody} role="tabpanel">
          <label className={styles.panelLabel} htmlFor={`notes-${entry.id}`}>
            Notes for {exercise.name}
          </label>
          <textarea
            id={`notes-${entry.id}`}
            className={styles.textarea}
            value={notes}
            maxLength={500}
            placeholder="Seat height, grip, cable position, pain-safe setup…"
            onChange={(event) => {
              setNotes(event.target.value);
              setSaved('idle');
            }}
          />
          <label className={styles.panelLabel} htmlFor={`cues-${entry.id}`}>
            Cues, one per line
          </label>
          <textarea
            id={`cues-${entry.id}`}
            className={styles.textarea}
            value={cues}
            rows={3}
            placeholder="Elbows tucked&#10;Drive through the floor"
            onChange={(event) => {
              setCues(event.target.value);
              setSaved('idle');
            }}
          />
          <div className={styles.panelActions}>
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => void save()}
              disabled={saved === 'saving'}
              data-testid="save-notes"
            >
              {saved === 'saving' ? 'Saving…' : 'Save notes'}
            </button>
            <span className={styles.panelNote} role="status">
              {saved === 'saved'
                ? 'Saved and verified. Shown here every time.'
                : saved === 'error'
                  ? 'Could not save.'
                  : 'Remembered for this exercise, on this device.'}
            </span>
          </div>
        </div>
      ) : null}

      {open === 'plates' && weightsTab ? (
        <div className={styles.panelBody} role="tabpanel" data-testid="plate-math">
          {plates ? (
            plates.kind === 'bar' ? (
              <PlateStack result={plates} />
            ) : (
              <>
                <p className={styles.plateText}>{plates.line}</p>
                <p className={styles.panelNote}>
                  {plates.kind === 'each-hand'
                    ? 'Dumbbell and kettlebell loads are per hand.'
                    : plates.kind === 'machine-plates'
                      ? 'The same on each side; the sled is not counted.'
                      : plates.kind === 'bodyweight'
                        ? 'Held or worn, on top of your own weight.'
                        : plates.kind === 'stack' && block.kind === 'superset'
                          ? 'Set the pin before the round starts.'
                          : 'No plates to load.'}
                </p>
              </>
            )
          ) : null}
          {/* A move with no load shows the weight held, with nothing for the place to set. */}
          {canLoad ? (
            <LoadingEditor
              exercise={exercise}
              units={units}
              loading={loading}
              spec={spec}
              placeName={placeName}
              missingPlates={missingPlates}
              onSave={onSaveLoading}
              onSetMissingPlates={onSetMissingPlates}
              placeLoading={placeLoading}
              onSaveMachine={onSaveMachine}
              hand={hand}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
