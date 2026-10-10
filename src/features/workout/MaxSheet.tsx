import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { useNow } from '../../core/time/clock';
import type { UnitSystem } from '../../core/validation/profile';
import { enteredE1rm, enteredMaxFor, type MaxInput } from '../../engine/progression/maxes';
import { weightSlip, type SlipQuestion } from '../../engine/progression/slips';
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

/** A recent set is read up to thirty reps (`maxFromSet`); more is refused, never read as thirty. */
const MOST_REPS = 30;

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
  const strengthMaxes = useAppSelector((state) => state.strengthMaxes);
  const history = useAppSelector((state) => state.history);
  const profile = useAppSelector((state) => state.profile);
  const [mode, setModeRaw] = useState<'set' | 'max'>('set');
  const [weight, setWeightRaw] = useState('');
  const [reps, setRepsRaw] = useState('');
  const [max, setMaxRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A number that looks like a slip, waiting to be kept or changed (Maintenance 26, item 40). */
  const [asking, setAsking] = useState<SlipQuestion | null>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const questionId = useId();
  // The question takes the focus: Enter again changes the number, never saves it (the review).
  useEffect(() => {
    if (asking) changeRef.current?.focus();
  }, [asking]);
  // Any change to what is entered takes the question away: it was about the old number.
  const setMode = (next: 'set' | 'max') => {
    setAsking(null);
    setModeRaw(next);
  };
  const setWeight = (next: string) => {
    setAsking(null);
    setWeightRaw(next);
  };
  const setReps = (next: string) => {
    setAsking(null);
    setRepsRaw(next);
  };
  const setMax = (next: string) => {
    setAsking(null);
    setMaxRaw(next);
  };

  const perHand = loadClass(exercise.load) === 'each' ? ' per hand' : '';
  const typedReps = parse(reps);
  const tooManyReps = mode === 'set' && typedReps !== null && Math.round(typedReps) > MOST_REPS;
  const input: MaxInput | null =
    mode === 'set'
      ? parse(weight) !== null && typedReps !== null && !tooManyReps
        ? { kind: 'set', weight: parse(weight) as number, reps: Math.round(typedReps) }
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

  // Compared with the lift's own logged sets (today's too) and the max saved for it, else with its
  // family or the body (docs/research/slip-checks.md); a max at or below the saved one never is.
  const now = useNow();
  const today = (session?.completed.sets ?? []).filter(
    (set) => set.exerciseId === exercise.id && set.kind === 'working' && !set.skipped,
  );
  const slip =
    input && profile
      ? weightSlip({
          exercise,
          weight: input.kind === 'set' ? input.weight : input.e1rm,
          reps: input.kind === 'set' ? input.reps : 1,
          max: input.kind === 'max',
          units,
          history,
          today: today.map((set) => ({ weight: set.weight, reps: set.reps })),
          saved: enteredMaxFor(strengthMaxes, exercise.id, units),
          profile,
          now: new Date(now).toISOString(),
          maxes: strengthMaxes,
        })
      : null;

  const save = async (keep = false) => {
    if (!input || busy) return;
    if (slip && !keep) {
      setAsking(slip);
      return;
    }
    setAsking(null);
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
        asking && input ? (
          // New buttons, with Change it where Save stood: a second tap or Enter on the spot of
          // Save changes the number and never saves it (the review of item 40).
          <div key="question" className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => void save(true)}
              disabled={busy}
              aria-describedby={questionId}
              data-testid="slip-keep"
            >
              {input.kind === 'set'
                ? `Save ${input.weight} ${units} × ${input.reps}`
                : `Save a max of ${input.e1rm} ${units}`}
            </Button>
            <Button
              ref={changeRef}
              onClick={() => {
                setAsking(null);
                (mode === 'set' ? weightRef : maxRef).current?.focus();
              }}
              aria-describedby={questionId}
              data-testid="slip-change"
            >
              Change it
            </Button>
          </div>
        ) : (
          <div key="entry" className={styles.actions}>
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
        )
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
              ref={weightRef}
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
              ref={maxRef}
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
      {tooManyReps ? (
        <p className={styles.slip} role="alert" data-testid="max-reps-limit">
          Up to {MOST_REPS} reps: a longer set says too little about a max.
        </p>
      ) : null}
      {asking ? (
        <p id={questionId} className={styles.slip} role="alert" data-testid="slip-question">
          {asking.text}
        </p>
      ) : null}
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
