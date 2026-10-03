import { useMemo, useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import type { UnitSystem } from '../../core/validation/profile';
import { enteredE1rm, type MaxInput } from '../../engine/progression/maxes';
import { loadClass } from '../../engine/progression/startingLoad';
import type { WorkoutEntry } from '../../engine/workout/types';
import styles from './MaxSheet.module.css';
import { previewText } from './maxPreviewText';

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
 * remembers (converted with Epley, every rep counted up to thirty) or a max they know. Shows the
 * target the save leaves the lift at today, as the plan will have it, before saving. "Not now"
 * brings the link back in a week; "Don't ask for this lift" keeps it away for good.
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

  const perHand = loadClass(exercise.load) === 'each' ? ' per hand' : '';
  const input: MaxInput | null =
    mode === 'set'
      ? parse(weight) !== null && parse(reps) !== null
        ? { kind: 'set', weight: parse(weight) as number, reps: Math.round(parse(reps) as number) }
        : null
      : parse(max) !== null
        ? { kind: 'max', e1rm: parse(max) as number }
        : null;
  // The save's own rebuild, run without saving: the preview is the target the plan will have
  // (Maintenance 25), never a second copy of the rule that sets it.
  const session = useAppSelector((state) => state.session);
  const preview = useMemo(
    () => (input && session ? store.previewStrengthMax(exercise.id, entry.id, input) : null),
    // `input` is rebuilt each render from the fields; its parts are what change the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, session, exercise.id, entry.id, mode, weight, reps, max],
  );

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
          : 'No max attempt needed: a recent best set works. A max that is newer than your last session and says more than your logged sets moves the target toward it, two steps at most, as far as the weights here allow, unless the lift is lighter today to win back missed reps; after three weeks or more away, a lower one counts too. Your next logged session takes over again.'}
      </p>
      {!offer && saved ? (
        <p className={styles.note} data-testid="max-saved">
          Saved now: {Math.round(enteredE1rm(saved))} {saved.units}
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
        {preview
          ? previewText(preview, mode, exercise.name, units, perHand, offer)
          : mode === 'set'
            ? 'Type a set you did, for example 135 for 8, and the target appears here.'
            : 'Type your max and the target appears here.'}
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
