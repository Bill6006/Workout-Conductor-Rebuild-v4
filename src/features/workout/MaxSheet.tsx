import { useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { useAppStore } from '../../core/state/useAppStore';
import type { UnitSystem } from '../../core/validation/profile';
import { weightStep } from '../../engine/plateMath/plateMath';
import { maxFromSet, type MaxInput } from '../../engine/progression/maxes';
import { loadFromEstimate } from '../../engine/progression/progression';
import { ENTERED_FRACTION, floorToBar, loadClass } from '../../engine/progression/startingLoad';
import type { WorkoutEntry } from '../../engine/workout/types';
import styles from './MaxSheet.module.css';

interface MaxSheetProps {
  exercise: CatalogExercise;
  entry: WorkoutEntry;
  units: UnitSystem;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

function parse(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The one-time max entry for a lift with no history: a set the lifter
 * remembers (converted with Epley) or a max they know. Shows the first target
 * it would set before saving. "Not now" brings the link back in a week;
 * "Don't ask for this lift" keeps it away for good.
 */
export function MaxSheet({ exercise, entry, units, open, onClose, onSaved }: MaxSheetProps) {
  const store = useAppStore();
  const [mode, setMode] = useState<'set' | 'max'>('set');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [max, setMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const working = entry.sets.find((set) => set.kind === 'working');
  const perHand = loadClass(exercise.load) === 'each' ? ' per hand' : '';
  const input: MaxInput | null =
    mode === 'set'
      ? parse(weight) !== null && parse(reps) !== null
        ? { kind: 'set', weight: parse(weight) as number, reps: Math.round(parse(reps) as number) }
        : null
      : parse(max) !== null
        ? { kind: 'max', e1rm: parse(max) as number }
        : null;
  const e1rm =
    input === null
      ? null
      : input.kind === 'max'
        ? input.e1rm
        : maxFromSet(input.weight, input.reps);
  const firstTarget =
    e1rm !== null && working
      ? floorToBar(
          loadFromEstimate(
            e1rm,
            working.targetReps[1],
            working.targetRir,
            ENTERED_FRACTION,
            weightStep(exercise, units),
          ),
          exercise,
          units,
        )
      : null;

  const save = async () => {
    if (!input || busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.recordStrengthMax(exercise.id, input);
      onSaved?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the max.');
    } finally {
      setBusy(false);
    }
  };

  const snooze = async (forGood: boolean) => {
    try {
      await store.snoozeMaxPrompt(exercise.id, forGood);
    } finally {
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      title={`Your max for ${exercise.name}`}
      onClose={onClose}
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void snooze(false)} data-testid="max-not-now">
            Not now
          </Button>
          <Button
            onClick={() => void save()}
            disabled={input === null || busy}
            data-testid="max-save"
          >
            Save
          </Button>
        </div>
      }
    >
      <p className={styles.note}>
        A set you remember, or a max you know, sets today's first target. It is used once: after
        your first logged set, the targets follow what you actually lift.
      </p>
      <div className={styles.segmented} role="radiogroup" aria-label="What you know">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'set'}
          className={styles.segment}
          onClick={() => setMode('set')}
        >
          A set I remember
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'max'}
          className={styles.segment}
          onClick={() => setMode('max')}
        >
          My one-rep max
        </button>
      </div>
      {mode === 'set' ? (
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>
              Weight ({units}
              {perHand})
            </span>
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              min={1}
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              data-testid="max-weight"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Reps</span>
            <input
              className={styles.input}
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={reps}
              onChange={(event) => setReps(event.target.value)}
              data-testid="max-reps"
            />
          </label>
        </div>
      ) : (
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>
              One-rep max ({units}
              {perHand})
            </span>
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              min={1}
              value={max}
              onChange={(event) => setMax(event.target.value)}
              data-testid="max-value"
            />
          </label>
        </div>
      )}
      <p className={styles.preview} data-testid="max-preview" aria-live="polite">
        {e1rm !== null && working && firstTarget !== null
          ? `About ${Math.round(e1rm)} ${units} max${perHand}. First target: ${firstTarget} ${units} × ${working.targetReps[0]}-${working.targetReps[1]} reps at RIR ${working.targetRir}.`
          : 'The first target appears here as you type.'}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className={styles.never}
        onClick={() => void snooze(true)}
        data-testid="max-never"
      >
        Don't ask for this lift
      </button>
    </Sheet>
  );
}
