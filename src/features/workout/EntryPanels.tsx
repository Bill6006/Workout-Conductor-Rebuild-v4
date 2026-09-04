import { useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { ExerciseDemo } from '../../components/ExerciseDetail/ExerciseMedia';
import type { CustomInstruction } from '../../core/validation/customExercise';
import type { UnitSystem } from '../../core/validation/profile';
import { plateMath } from '../../engine/plateMath/plateMath';
import type { WorkoutBlock, WorkoutEntry } from '../../engine/workout/types';
import { useCustomMedia } from '../library/useCustomMedia';
import styles from './ActiveWorkout.module.css';
import { effortGuidance, restGuidance } from './effort';
import type { PreviousPerformance } from './previousPerformance';

export interface EntryPanelsProps {
  entry: WorkoutEntry;
  block: WorkoutBlock;
  exercise: CatalogExercise;
  units: UnitSystem;
  /** Weight the logger currently shows, for Plate Math. */
  currentWeight: number | null;
  previous: PreviousPerformance | null;
  instruction: CustomInstruction | undefined;
  onSaveNotes: (notes: string, cues: string[]) => Promise<void>;
  onOptions: () => void;
}

type Panel = 'howto' | 'notes' | 'plates' | null;

/**
 * Compact expandable panels under the current exercise: demonstration and
 * instructions, per-exercise notes and cue memory, Plate Math, and the
 * options sheet. Nothing here scrolls the whole screen away from the set.
 */
export function EntryPanels({
  entry,
  block,
  exercise,
  units,
  currentWeight,
  previous,
  instruction,
  onSaveNotes,
  onOptions,
}: EntryPanelsProps) {
  const [open, setOpen] = useState<Panel>(null);
  const [notes, setNotes] = useState(instruction?.notes ?? '');
  const [cues, setCues] = useState((instruction?.cues ?? []).join('\n'));
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const customMedia = useCustomMedia(exercise.id);
  const plates =
    currentWeight !== null && currentWeight > 0 ? plateMath(exercise, currentWeight, units) : null;

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
      <div className={styles.panelTabs} role="tablist" aria-label="Exercise panels">
        <button
          type="button"
          role="tab"
          aria-selected={open === 'howto'}
          className={styles.panelTab}
          onClick={() => toggle('howto')}
        >
          How to
        </button>
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
        {plates ? (
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
        <button
          type="button"
          className={styles.panelTab}
          onClick={onOptions}
          data-testid="options-tab"
        >
          Options
        </button>
      </div>

      {open === 'howto' ? (
        <div className={styles.panelBody} role="tabpanel">
          <ExerciseDemo exercise={exercise} customMedia={customMedia} />
          {previous ? (
            <p className={styles.panelNote}>
              Last time: {previous.weight === null ? 'bodyweight' : `${previous.weight} ${units}`} ×{' '}
              {previous.reps}
              {previous.rir === null ? '' : ` @ RIR ${previous.rir}`}, {previous.sets} working sets.
            </p>
          ) : null}
          <h4 className={styles.panelTitle}>Why this target</h4>
          <ul className={styles.panelList} data-testid="progression-evidence">
            {(entry.progression?.evidence ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
            {entry.manual?.weight || entry.manual?.reps ? (
              <li>You set this by hand; the engines keep your values.</li>
            ) : null}
            {[
              ...effortGuidance(
                'working',
                entry.sets.find((set) => set.kind === 'working')?.targetRir ?? 2,
                entry.role,
              ).evidence,
              ...restGuidance(entry.role, entry.restSeconds).evidence,
            ].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <h4 className={styles.panelTitle}>Setup</h4>
          <ol className={styles.panelList}>
            {(instruction?.setup.length ? instruction.setup : exercise.instructions.setup).map(
              (step) => (
                <li key={step}>{step}</li>
              ),
            )}
          </ol>
          <h4 className={styles.panelTitle}>Execution</h4>
          <ol className={styles.panelList}>
            {(instruction?.execution.length
              ? instruction.execution
              : exercise.instructions.execution
            ).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {instruction && instruction.cues.length > 0 ? (
            <>
              <h4 className={styles.panelTitle}>Your cues</h4>
              <ul className={styles.panelList}>
                {instruction.cues.map((cue) => (
                  <li key={cue}>{cue}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className={styles.panelNote}>{exercise.instructions.breathing}</p>
        </div>
      ) : null}

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

      {open === 'plates' && plates ? (
        <div className={styles.panelBody} role="tabpanel" data-testid="plate-math">
          <p className={styles.plateLine}>{plates.line}</p>
          {plates.kind === 'bar' && plates.perSide.length > 0 ? (
            <div className={styles.plateRow} aria-label="Plates per side">
              {plates.perSide.map((plate, index) => (
                <span key={`${plate}-${index}`} className={styles.plate} data-size={plate}>
                  {plate}
                </span>
              ))}
            </div>
          ) : null}
          <p className={styles.panelNote}>
            {plates.kind === 'bar'
              ? `Bar ${plates.barWeight} ${units}; standard plates. Same on both sides.`
              : plates.kind === 'each-hand'
                ? 'Dumbbell and kettlebell loads are per hand.'
                : block.kind === 'superset'
                  ? 'Set the pin before the round starts.'
                  : 'No plates to load.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
