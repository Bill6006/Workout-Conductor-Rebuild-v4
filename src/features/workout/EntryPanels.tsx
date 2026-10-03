import { useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { CustomInstruction } from '../../core/validation/customExercise';
import type { UnitSystem } from '../../core/validation/profile';
import type { Loading, LoadingSpec } from '../../engine/loading/loading';
import { plateMath } from '../../engine/plateMath/plateMath';
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
  placeName: string;
  missingPlates: readonly number[];
  onSaveLoading: (spec: LoadingSpec | null) => Promise<void>;
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
  placeName,
  missingPlates,
  onSaveLoading,
  onSetMissingPlates,
  openRequest = null,
}: EntryPanelsProps) {
  const [open, setOpen] = useState<Panel>(null);
  const [notes, setNotes] = useState(instruction?.notes ?? '');
  const [cues, setCues] = useState((instruction?.cues ?? []).join('\n'));
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const plates =
    currentWeight !== null && currentWeight > 0
      ? plateMath(exercise, currentWeight, units, loading.perSide ?? undefined)
      : null;

  // The place's weights can be set on any lift that takes a load, with or without a weight showing.
  const canLoad = exercise.load !== 'bodyweight' && exercise.load !== 'band';

  // A new request opens its panel once. Comparing during render keeps setState out of an effect.
  const [handledRequest, setHandledRequest] = useState(openRequest);
  if (openRequest !== handledRequest) {
    setHandledRequest(openRequest);
    if (openRequest) setOpen(openRequest.panel);
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
            {plates || canLoad ? (
              <button
                type="button"
                role="tab"
                aria-selected={open === 'plates'}
                className={styles.panelTab}
                onClick={() => toggle('plates')}
                data-testid="plates-tab"
              >
                Plates
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

      {open === 'plates' ? (
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
                    : block.kind === 'superset'
                      ? 'Set the pin before the round starts.'
                      : 'No plates to load.'}
                </p>
              </>
            )
          ) : null}
          <LoadingEditor
            exercise={exercise}
            units={units}
            loading={loading}
            spec={spec}
            placeName={placeName}
            missingPlates={missingPlates}
            onSave={onSaveLoading}
            onSetMissingPlates={onSetMissingPlates}
          />
        </div>
      ) : null}
    </div>
  );
}
