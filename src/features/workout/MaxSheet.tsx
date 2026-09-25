import { useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import type { UnitSystem } from '../../core/validation/profile';
import { weightStep } from '../../engine/plateMath/plateMath';
import { maxFromSet, type MaxInput } from '../../engine/progression/maxes';
import {
  ENTERED_WITH_HISTORY_FRACTION,
  loadFromEstimate,
} from '../../engine/progression/progression';
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
  /**
   * True for the one-time offer on a lift with no history, which can be snoozed. False when the
   * lifter opened it from Options to enter or update a max on any lift.
   */
  offer?: boolean;
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
export function MaxSheet({
  exercise,
  entry,
  units,
  open,
  onClose,
  onSaved,
  offer = true,
}: MaxSheetProps) {
  const store = useAppStore();
  const saved = useAppSelector((state) => state.strengthMaxes.maxes[exercise.id] ?? null);
  const [mode, setMode] = useState<'set' | 'max'>('set');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [max, setMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const working = entry.sets.find((set) => set.kind === 'working');
  // The range the first target is for: reps set by hand as they are, else the range a pushed set
  // stands in for, never the push's extra reps (Maintenance 23).
  const range = working
    ? entry.manual?.reps
      ? working.targetReps
      : (working.asked?.reps ?? working.targetReps)
    : null;
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
    e1rm !== null && working && range
      ? floorToBar(
          loadFromEstimate(
            e1rm,
            range[1],
            working.targetRir,
            // A lift with logged history is asked for a little more of what the max implies.
            !offer && entry.progression && entry.progression.mode !== 'start'
              ? ENTERED_WITH_HISTORY_FRACTION
              : ENTERED_FRACTION,
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
          {offer ? (
            <Button
              variant="secondary"
              onClick={() => void snooze(false)}
              data-testid="max-not-now"
            >
              Not now
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose} data-testid="max-cancel">
              Cancel
            </Button>
          )}
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
        {offer
          ? 'No max attempt needed. Enter a recent set you did, weight and reps, and the app estimates your one-rep max from it and sets today’s first target under that estimate. Used once: after your first logged set, the targets follow what you actually lift.'
          : 'No max attempt needed: a recent best set works. A max that is newer than your last session and says more than your logged sets moves the target toward it, two steps at most. Your next logged session takes over again.'}
      </p>
      {!offer && saved ? (
        <p className={styles.note} data-testid="max-saved">
          Saved now: {Math.round(saved.e1rm)} {saved.units}
          {perHand}, entered {new Date(saved.enteredAt).toLocaleDateString()}.
        </p>
      ) : null}
      <div className={styles.segmented} role="radiogroup" aria-label="What you know">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'set'}
          className={styles.segment}
          onClick={() => setMode('set')}
        >
          A recent set
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'max'}
          className={styles.segment}
          onClick={() => setMode('max')}
        >
          I know my max
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
            <span className={styles.label}>Reps you got</span>
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
        {e1rm !== null && working && range && firstTarget !== null
          ? `${mode === 'set' ? `Estimated max about ${Math.round(e1rm)} ${units}${perHand} from that set` : `Max ${Math.round(e1rm)} ${units}${perHand}`}. ${offer ? 'First target' : 'On its own it puts the target at'}: ${firstTarget} ${units} × ${range[0]}-${range[1]} reps at RIR ${working.targetRir}.`
          : mode === 'set'
            ? 'Type a set you did, for example 135 for 8, and the first target appears here.'
            : 'Type your max and the first target appears here.'}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {offer ? (
        <button
          type="button"
          className={styles.never}
          onClick={() => void snooze(true)}
          data-testid="max-never"
        >
          Don't ask for this lift
        </button>
      ) : null}
    </Sheet>
  );
}
