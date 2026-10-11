import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { nudge, snapDown } from '../../engine/loading/loading';
import type { SlipQuestion } from '../../engine/progression/slips';
import type { SetKind } from '../../engine/workout/types';
import styles from './SetLogger.module.css';

/**
 * The reusable set-logging surface. Three large value dials (weight, reps,
 * RIR) prefilled from the last set or the target, each nudged with one large
 * chevron or typed directly on the Android numeric keyboard, and one dominant
 * thumb-reach button that logs the set. A normal set is one tap; a small
 * change is two. The same surface edits a completed set in place, so there is
 * never a separate edit page or a keypad grid. A hold logs seconds instead of
 * reps and asks no reps in reserve; its countdown sits above the button.
 */

export interface SetLoggerValues {
  weight: number | null;
  reps: number;
  rir: number | null;
  /** A reserve check's numbers (Maintenance 27, item 43), only from a logger in check mode. */
  reserveCheck?: ReserveCheckValues;
}

/** What a reserve check adds to a set: the reps in all, and how it ended. */
export interface ReserveCheckValues {
  total: number;
  failedEarly?: boolean;
  stopped?: boolean;
}

export interface SetLoggerTarget {
  kind: SetKind;
  reps: [number, number];
  rir: number;
  weight: number | null;
  /** For example "Set 2 of 4" or "Ramp set 1 of 2". */
  label: string;
}

interface SetLoggerProps {
  units: 'lb' | 'kg';
  target: SetLoggerTarget;
  initial: SetLoggerValues;
  mode: 'log' | 'edit';
  weightStep: number;
  onCommit: (values: SetLoggerValues) => void;
  /** Every value change, so the screen can keep Plate Math in step with the weight. */
  onChange?: (values: SetLoggerValues) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  /** Plate Math or a per-hand clarification for the current weight. */
  /** What to load for the weight on the dial: the plates, or a line of text. */
  helper?: ReactNode;
  /** Replaces the line under the weight, for example "Bodyweight" on a bodyweight move. */
  weightHint?: string;
  /** The weights this place can load, ascending; the nudges move through them. Null: any step. */
  available?: readonly number[] | null;
  /** Makes the line under the weight tappable, for the way into Plates. */
  onWeightHintTap?: () => void;
  /** Why the target is what it is when the weights here changed it, shown by the target. */
  note?: string | null;
  /** A held exercise: the reps dial counts seconds, and there is no RIR. */
  hold?: boolean;
  /** A lift with no load: its warm-up is a few easy reps, and the hints say so plainly. */
  noLoad?: boolean;
  /** Seconds a finished countdown filled in; a new nonce fills again without losing the weight. */
  filled?: { reps: number; nonce: string } | null;
  /** The hold's countdown, shown above the button. */
  timer?: ReactNode;
  /**
   * Whether the values about to be logged look like a slip (Maintenance 26, item 40): asked once,
   * kept with one tap or changed. Null: they are plausible.
   */
  question?: (values: SetLoggerValues) => SlipQuestion | null;
  /**
   * This set is today's reserve check (Maintenance 27, item 43): the reps and reserve dials say
   * the reps at the lifter's usual stop and the reserve judged there, a fourth dial counts the
   * reps in all, and two switches say a set stalled early or was stopped for pain or form. The
   * numbers it starts from, when the set is corrected.
   */
  reserveCheck?: Partial<ReserveCheckValues> | null;
}

type Field = 'weight' | 'reps' | 'rir' | 'total';

const COOLDOWN_MS = 450;

function clampReps(value: number): number {
  return Math.max(0, Math.min(200, Math.round(value)));
}

function clampRir(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function roundWeight(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

export function SetLogger({
  units,
  target,
  initial,
  mode,
  weightStep,
  onCommit,
  onChange,
  onCancel,
  onDelete,
  disabled = false,
  helper = null,
  weightHint,
  available = null,
  onWeightHintTap,
  note = null,
  hold = false,
  noLoad = false,
  filled = null,
  timer = null,
  question,
  reserveCheck = null,
}: SetLoggerProps) {
  const checking = reserveCheck !== null && !hold;
  const [total, setTotal] = useState<number>(() =>
    clampReps(reserveCheck?.total ?? initial.reps + (initial.rir ?? target.rir) + 1),
  );
  const [failedEarly, setFailedEarly] = useState(reserveCheck?.failedEarly === true);
  const [stopped, setStopped] = useState(reserveCheck?.stopped === true);
  const [values, setValues] = useState<SetLoggerValues>(() =>
    filled ? { ...initial, reps: filled.reps } : initial,
  );
  const [typing, setTyping] = useState<Field | null>(null);
  const [typed, setTyped] = useState('');
  const [cooling, setCooling] = useState(false);
  /** Once the weight has been turned or typed, the target's nudge stops asking. */
  const [touchedWeight, setTouchedWeight] = useState(false);
  /** Values that look like a slip, waiting for the lifter to keep or change them (item 40). */
  const [asking, setAsking] = useState<{ question: SlipQuestion; values: SetLoggerValues } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const questionId = useId();
  /** Keep is ready a moment after a question opens; Change it, and Log after it, never wait. */
  const [keepReady, setKeepReady] = useState(true);
  // One wait at a time: a question asked again starts its own (the third pass of item 40: one
  // asked again within the wait was ready early).
  const keepTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(keepTimer.current), []);

  // The field opened for typing takes the focus, so the numeric keyboard comes up on it.
  useEffect(() => {
    if (!typing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [typing]);

  // The question takes the focus where the button that asked it stood: "Change it" is the safe one.
  useEffect(() => {
    if (asking) changeRef.current?.focus();
  }, [asking]);

  const update = (next: SetLoggerValues) => {
    setAsking(null);
    setValues(next);
    onChange?.(next);
  };

  // A logger that starts (again) says its own value at once: the screen draws the plates for the
  // weight it last heard, and a target that moves and comes back would otherwise bring back a
  // weight turned on an earlier logger (Maintenance 25, the tenth review).
  useEffect(() => {
    onChange?.(values);
    // Once, as the logger starts: every later change is reported by update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A countdown that ends, or is stopped, writes its seconds into the dial. Only the seconds
  // change, so the weight (and the screen's plate line that follows it) stays as it was.
  const fillNonce = filled?.nonce ?? null;
  const fillReps = filled?.reps ?? null;
  const lastFill = useRef(fillNonce);
  useEffect(() => {
    if (fillNonce === null || fillReps === null || lastFill.current === fillNonce) return;
    lastFill.current = fillNonce;
    setTyping(null);
    // The question was about the seconds before: Keep would log those, not the dial's (the review).
    setAsking(null);
    setValues((current) => ({ ...current, reps: clampReps(fillReps) }));
  }, [fillNonce, fillReps]);

  const nudgeWeight = (direction: 1 | -1) => {
    const base = values.weight ?? target.weight ?? 0;
    setTouchedWeight(true);
    update({ ...values, weight: roundWeight(nudge(base, direction, available, weightStep)) });
  };
  const nudgeReps = (direction: 1 | -1) =>
    update({ ...values, reps: clampReps(values.reps + direction) });
  const nudgeRir = (direction: 1 | -1) =>
    update({ ...values, rir: clampRir((values.rir ?? target.rir) + direction) });
  const nudgeTotal = (direction: 1 | -1) => {
    setAsking(null);
    setTotal((current) => clampReps(current + direction));
  };

  const beginTyping = (field: Field) => {
    setAsking(null);
    if (field === 'weight') setTouchedWeight(true);
    const current =
      field === 'weight'
        ? values.weight
        : field === 'reps'
          ? values.reps
          : field === 'total'
            ? total
            : values.rir;
    setTyped(current === null ? '' : String(current));
    setTyping(field);
  };

  const typedValues = (): SetLoggerValues => {
    if (!typing) return values;
    const parsed = typed.trim() === '' ? null : Number(typed);
    const valid = parsed !== null && Number.isFinite(parsed);
    if (typing === 'weight') return { ...values, weight: valid ? roundWeight(parsed) : null };
    if (typing === 'reps') return { ...values, reps: valid ? clampReps(parsed) : values.reps };
    if (typing === 'total') return values;
    return { ...values, rir: valid ? clampRir(parsed) : values.rir };
  };

  /** The reps in all as typed, while the total dial is open for typing. */
  const typedTotal = (): number => {
    if (typing !== 'total') return total;
    const parsed = typed.trim() === '' ? null : Number(typed);
    return parsed !== null && Number.isFinite(parsed) ? clampReps(parsed) : total;
  };

  const endTyping = () => {
    if (!typing) return;
    if (typing === 'total') setTotal(typedTotal());
    else update(typedValues());
    setTyping(null);
  };

  /** What a log commits: the numbers as the set keeps them. */
  const toCommit = (final: SetLoggerValues): SetLoggerValues => {
    if (!checking) {
      return {
        weight: final.weight,
        reps: clampReps(final.reps),
        rir: hold || final.rir === null ? null : clampRir(final.rir),
      };
    }
    // A set that stalled before the usual stop was taken to failure there: its reps are the reps
    // in all, with nothing in reserve (Maintenance 27, item 43).
    const all = clampReps(final.reserveCheck?.total ?? total);
    return {
      weight: final.weight,
      reps: failedEarly ? all : clampReps(final.reps),
      rir: failedEarly ? 0 : final.rir === null ? null : clampRir(final.rir),
      reserveCheck: {
        total: all,
        ...(failedEarly ? { failedEarly: true } : {}),
        ...(stopped ? { stopped: true } : {}),
      },
    };
  };

  const send = (final: SetLoggerValues) => {
    setCooling(true);
    window.setTimeout(() => setCooling(false), COOLDOWN_MS);
    onCommit(toCommit(final));
  };

  const commit = () => {
    if (disabled || cooling) return;
    const typedAll = typedTotal();
    const final: SetLoggerValues = checking
      ? { ...typedValues(), reserveCheck: { total: typedAll } }
      : typedValues();
    if (typing) {
      if (typing === 'total') setTotal(typedAll);
      else update(final);
      setTyping(null);
    }
    // A number that looks like a slip is asked about once, before it steers anything (item 40).
    // Keep waits a moment, so a second tap meant for the log button keeps nothing unread (the
    // re-check: the question's words push the buttons down, and Keep can sit under it).
    // Asked of the numbers the set will keep: a check that stalled early keeps its reps in all.
    const slip = question?.(toCommit(final)) ?? null;
    if (slip) {
      setAsking({ question: slip, values: final });
      setKeepReady(false);
      window.clearTimeout(keepTimer.current);
      keepTimer.current = window.setTimeout(() => setKeepReady(true), COOLDOWN_MS);
      return;
    }
    send(final);
  };

  /** The lifter keeps the values asked about: they are logged as they are. */
  const keep = () => {
    if (!asking || disabled || cooling || !keepReady) return;
    const final = asking.values;
    setAsking(null);
    send(final);
  };

  /** Back to the number asked about, ready to type. */
  const change = () => {
    if (!asking) return;
    // A check that stalled early keeps its reps in all: a slip in them is typed there.
    const reps = checking && failedEarly ? 'total' : 'reps';
    beginTyping(asking.question.field === 'reps' ? reps : 'weight');
  };

  const [low, high] = target.reps;
  // A hold's target is its first number; holding past it is never too much.
  const inRange = values.reps >= low && (hold || values.reps <= high);
  // Zero reps is a skip, and the button says so before the tap rather than after it.
  // A check that stalled early commits its reps in all: those are what a skip reads (the re-check).
  const shownReps =
    checking && failedEarly ? typedTotal() : typing === 'reps' ? typedValues().reps : values.reps;
  const skipping = shownReps === 0;
  const buttonLabel =
    mode === 'edit'
      ? skipping
        ? 'Save as skipped'
        : 'Save set'
      : skipping
        ? target.kind === 'warmup'
          ? 'Skip warm-up set'
          : 'Skip set'
        : target.kind === 'warmup'
          ? 'Log warm-up set'
          : 'Log set';
  // The line under the weight always says what to load for this set.
  const weightLabel =
    target.kind === 'warmup' ? 'Warm-up' : target.kind === 'drop' ? 'Drop' : 'Target';
  // A target this place cannot make names the nearest weight it can.
  const nearest =
    target.weight !== null &&
    available !== null &&
    available.length > 0 &&
    !available.some((weight) => Math.abs(weight - (target.weight ?? 0)) < 1e-6)
      ? snapDown(target.weight, available)
      : null;
  const weightHintText =
    weightHint ??
    (target.weight === null
      ? target.kind === 'warmup'
        ? 'Warm-up · light'
        : 'Enter a weight'
      : `${weightLabel} ${target.weight} ${units}${nearest !== null ? ` · nearest ${nearest}` : ''}`);
  // The target is asking for more than the untouched dial shows: say so until the dial moves.
  const wantsMore =
    mode === 'log' &&
    !touchedWeight &&
    target.kind === 'working' &&
    target.weight !== null &&
    values.weight !== null &&
    values.weight < target.weight - 1e-6;
  // Short enough to fit under a dial on a phone: the head ("Ramp 1 of 2"), the weight line and
  // the button already say a ramp is a warm-up, and the head says a drop set is one.
  // A warm-up at bodyweight is a few easy reps, said plainly (Maintenance 23).
  const easyWarmup = noLoad && target.kind === 'warmup';
  const repsHint = hold
    ? `Target ${low} s`
    : easyWarmup
      ? 'A few easy reps'
      : target.kind === 'drop'
        ? `Aim ${low}-${high}`
        : `Target ${low}-${high}`;

  const dial = (
    field: Field,
    label: string,
    short: string,
    display: string,
    unit: string,
    onUp: () => void,
    onDown: () => void,
    hint: string,
    tone: 'normal' | 'warn' = 'normal',
    extra: { pulse?: boolean; onTap?: () => void } = {},
  ) => (
    <div className={styles.dial} data-field={field} data-tone={tone}>
      <button
        type="button"
        className={styles.nudge}
        onClick={onUp}
        aria-label={`Increase ${short}`}
        disabled={disabled}
      >
        <span aria-hidden="true">▲</span>
      </button>
      {typing === field ? (
        <input
          ref={inputRef}
          className={styles.input}
          type="number"
          inputMode={field === 'weight' ? 'decimal' : 'numeric'}
          value={typed}
          aria-label={label}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={endTyping}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              endTyping();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.value}
          onClick={() => beginTyping(field)}
          aria-label={`${label}, ${display}. Tap to type`}
          data-testid={`logger-${field}`}
          disabled={disabled}
        >
          <span className={styles.number}>{display}</span>
          <span className={styles.unit}>{unit}</span>
        </button>
      )}
      <button
        type="button"
        className={styles.nudge}
        onClick={onDown}
        aria-label={`Decrease ${short}`}
        disabled={disabled}
      >
        <span aria-hidden="true">▼</span>
      </button>
      {extra.onTap ? (
        <button
          type="button"
          className={`${styles.hint} ${styles.hintButton}`}
          onClick={extra.onTap}
          data-pulse={extra.pulse ? 'true' : undefined}
          data-testid={`${field}-hint`}
        >
          {hint}
        </button>
      ) : (
        <span
          className={styles.hint}
          data-pulse={extra.pulse ? 'true' : undefined}
          data-testid={`${field}-hint`}
        >
          {hint}
        </span>
      )}
    </div>
  );

  return (
    <section
      className={styles.logger}
      aria-label={mode === 'edit' ? 'Edit set' : 'Log set'}
      data-testid="set-logger"
      data-mode={mode}
    >
      <div className={styles.head}>
        <span className={styles.label} data-testid="target-line">
          {mode === 'edit' ? `Editing ${target.label}` : target.label}
        </span>
        {helper ? (
          <span className={styles.helper} data-testid="logger-helper">
            {helper}
          </span>
        ) : null}
      </div>
      <div className={styles.dials} data-count={hold ? 2 : checking && !failedEarly ? 4 : 3}>
        {dial(
          'weight',
          'Weight',
          `weight by ${weightStep} ${units}`,
          values.weight === null ? '—' : String(values.weight),
          units,
          () => nudgeWeight(1),
          () => nudgeWeight(-1),
          weightHintText,
          'normal',
          { pulse: wantsMore, onTap: onWeightHintTap },
        )}
        {checking && failedEarly
          ? null
          : dial(
              'reps',
              hold ? 'Seconds' : checking ? 'Reps at your stop' : 'Reps',
              hold ? 'seconds' : 'reps',
              String(values.reps),
              hold ? 'seconds' : 'reps',
              () => nudgeReps(1),
              () => nudgeReps(-1),
              checking ? 'At your usual stop' : repsHint,
              inRange || target.kind !== 'working' || checking ? 'normal' : 'warn',
            )}
        {hold || (checking && failedEarly)
          ? null
          : dial(
              'rir',
              'RIR',
              'RIR',
              values.rir === null ? '—' : String(values.rir),
              'in reserve',
              () => nudgeRir(1),
              () => nudgeRir(-1),
              checking
                ? 'Judged at the stop'
                : easyWarmup
                  ? 'Stop well short'
                  : target.kind === 'warmup'
                    ? `Easy, RIR ${target.rir}`
                    : target.kind === 'drop'
                      ? 'Last clean rep'
                      : `Target RIR ${target.rir}`,
            )}
        {checking
          ? dial(
              'total',
              'Reps in all',
              'reps in all',
              String(typing === 'total' ? typedTotal() : total),
              'in all',
              () => nudgeTotal(1),
              () => nudgeTotal(-1),
              failedEarly || stopped || total >= values.reps
                ? 'Every good rep, in all'
                : 'At least the reps at your stop',
              failedEarly || stopped || total >= values.reps ? 'normal' : 'warn',
            )
          : null}
      </div>
      {checking ? (
        <div className={styles.check} data-testid="check-panel">
          <p className={styles.note} data-testid="check-note">
            Reserve check: lift to your usual stop and judge the reps left, then keep going without
            racking until you cannot finish a rep with good form (a burn is not failure).
          </p>
          <label className={styles.checkOption}>
            <input
              type="checkbox"
              checked={failedEarly}
              onChange={(event) => {
                setAsking(null);
                setFailedEarly(event.target.checked);
                // A set that stalled went to failure; one stopped did not: one or the other.
                if (event.target.checked) setStopped(false);
              }}
              disabled={disabled}
              data-testid="check-failed-early"
            />
            It stalled before my usual stop
          </label>
          <label className={styles.checkOption}>
            <input
              type="checkbox"
              checked={stopped}
              onChange={(event) => {
                setAsking(null);
                setStopped(event.target.checked);
                if (event.target.checked) setFailedEarly(false);
              }}
              disabled={disabled}
              data-testid="check-stopped"
            />
            I stopped before failure (pain, form or anything else)
          </label>
        </div>
      ) : null}
      {note ? (
        <p className={styles.note} data-testid="target-note">
          {note}
        </p>
      ) : null}
      {timer}
      {asking ? (
        <div className={styles.question} data-testid="slip-question">
          <p id={questionId} className={styles.questionText} role="alert">
            {asking.question.text}
          </p>
          {/* Change it takes the focus and Keep waits a moment: a second tap or Enter changes the
              number, never logs it. An edit can still be cancelled. */}
          <div className={styles.actions}>
            {mode === 'edit' ? (
              <button type="button" className={styles.secondary} onClick={onCancel}>
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              className={styles.secondary}
              onClick={keep}
              disabled={disabled || cooling || !keepReady}
              aria-describedby={questionId}
              data-testid="slip-keep"
            >
              {keepLabel(mode, toCommit(asking.values), units, hold)}
            </button>
            <button
              ref={changeRef}
              type="button"
              className={styles.primary}
              onClick={change}
              aria-describedby={questionId}
              data-testid="slip-change"
            >
              Change it
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          {mode === 'edit' ? (
            <>
              <button type="button" className={styles.secondary} onClick={onCancel}>
                Cancel
              </button>
              {onDelete ? (
                <button type="button" className={styles.secondary} onClick={onDelete}>
                  Remove
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className={styles.primary}
            onClick={commit}
            disabled={disabled || cooling}
            data-testid="log-set"
            data-intent={skipping ? 'skip' : 'log'}
          >
            {buttonLabel}
          </button>
        </div>
      )}
    </section>
  );
}

/** The button that keeps values asked about names them: "Log 1850 lb × 5". */
function keepLabel(
  mode: 'log' | 'edit',
  values: SetLoggerValues,
  units: 'lb' | 'kg',
  hold: boolean,
): string {
  const verb = mode === 'edit' ? 'Save' : 'Log';
  const count = hold ? `${values.reps} s` : `${values.reps}`;
  if (values.weight === null) return `${verb} ${count}${hold ? '' : ' reps'}`;
  return `${verb} ${values.weight} ${units} ${hold ? 'for' : '×'} ${count}`;
}
