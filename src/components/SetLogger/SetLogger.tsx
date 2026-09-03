import { useEffect, useRef, useState } from 'react';
import type { SetKind } from '../../engine/workout/types';
import styles from './SetLogger.module.css';

/**
 * The reusable set-logging surface. Three large value dials (weight, reps,
 * RIR) prefilled from the last set or the target, each nudged with one large
 * chevron or typed directly on the Android numeric keyboard, and one dominant
 * thumb-reach button that logs the set. A normal set is one tap; a small
 * change is two. The same surface edits a completed set in place, so there is
 * never a separate edit page or a keypad grid.
 */

export interface SetLoggerValues {
  weight: number | null;
  reps: number;
  rir: number | null;
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
  helper?: string | null;
}

type Field = 'weight' | 'reps' | 'rir';

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
}: SetLoggerProps) {
  const [values, setValues] = useState<SetLoggerValues>(initial);
  const [typing, setTyping] = useState<Field | null>(null);
  const [typed, setTyped] = useState('');
  const [cooling, setCooling] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typing) inputRef.current?.select();
  }, [typing]);

  const update = (next: SetLoggerValues) => {
    setValues(next);
    onChange?.(next);
  };

  const nudgeWeight = (direction: 1 | -1) => {
    const base = values.weight ?? target.weight ?? 0;
    update({ ...values, weight: roundWeight(base + direction * weightStep) });
  };
  const nudgeReps = (direction: 1 | -1) =>
    update({ ...values, reps: clampReps(values.reps + direction) });
  const nudgeRir = (direction: 1 | -1) =>
    update({ ...values, rir: clampRir((values.rir ?? target.rir) + direction) });

  const beginTyping = (field: Field) => {
    const current =
      field === 'weight' ? values.weight : field === 'reps' ? values.reps : values.rir;
    setTyped(current === null ? '' : String(current));
    setTyping(field);
  };

  const typedValues = (): SetLoggerValues => {
    if (!typing) return values;
    const parsed = typed.trim() === '' ? null : Number(typed);
    const valid = parsed !== null && Number.isFinite(parsed);
    if (typing === 'weight') return { ...values, weight: valid ? roundWeight(parsed) : null };
    if (typing === 'reps') return { ...values, reps: valid ? clampReps(parsed) : values.reps };
    return { ...values, rir: valid ? clampRir(parsed) : values.rir };
  };

  const endTyping = () => {
    if (!typing) return;
    update(typedValues());
    setTyping(null);
  };

  const commit = () => {
    if (disabled || cooling) return;
    const final = typedValues();
    if (typing) {
      update(final);
      setTyping(null);
    }
    setCooling(true);
    window.setTimeout(() => setCooling(false), COOLDOWN_MS);
    onCommit({
      weight: final.weight,
      reps: clampReps(final.reps),
      rir: final.rir === null ? null : clampRir(final.rir),
    });
  };

  const [low, high] = target.reps;
  const inRange = values.reps >= low && values.reps <= high;
  const repsHint =
    target.kind === 'drop'
      ? `Drop set · aim ${low}-${high}`
      : `Target ${low}-${high}${target.kind === 'warmup' ? ' · ramp, not counted' : ''}`;

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
      <span className={styles.hint}>{hint}</span>
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
        <span className={styles.label}>
          {mode === 'edit' ? `Editing ${target.label}` : target.label}
        </span>
        {helper ? <span className={styles.helper}>{helper}</span> : null}
      </div>
      <div className={styles.dials}>
        {dial(
          'weight',
          'Weight',
          'weight',
          values.weight === null ? '—' : String(values.weight),
          units,
          () => nudgeWeight(1),
          () => nudgeWeight(-1),
          target.weight === null ? `Step ${weightStep}` : `Target ${target.weight}`,
        )}
        {dial(
          'reps',
          'Reps',
          'reps',
          String(values.reps),
          'reps',
          () => nudgeReps(1),
          () => nudgeReps(-1),
          repsHint,
          inRange || target.kind !== 'working' ? 'normal' : 'warn',
        )}
        {dial(
          'rir',
          'RIR',
          'RIR',
          values.rir === null ? '—' : String(values.rir),
          'in reserve',
          () => nudgeRir(1),
          () => nudgeRir(-1),
          `Target RIR ${target.rir}`,
        )}
      </div>
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
        >
          {mode === 'edit' ? 'Save set' : target.kind === 'warmup' ? 'Log ramp set' : 'Log set'}
        </button>
      </div>
    </section>
  );
}
