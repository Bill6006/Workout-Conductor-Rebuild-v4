import { useState } from 'react';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import formStyles from '../../components/Form/Form.module.css';
import type { UnitSystem } from '../../core/validation/profile';
import {
  DUMBBELLS_KEY,
  PLATES_KEY,
  describeSpec,
  loadingKeyFor,
  type Loading,
  type LoadingRange,
  type LoadingSpec,
} from '../../engine/loading/loading';
import { PLATE_INVENTORY } from '../../engine/plateMath/plateMath';
import styles from './ActiveWorkout.module.css';

interface LoadingEditorProps {
  exercise: CatalogExercise;
  units: UnitSystem;
  loading: Loading;
  /** What the place has recorded for this exercise, its dumbbells, or its plates. */
  spec: LoadingSpec | null;
  placeName: string;
  missingPlates: readonly number[];
  onSave: (spec: LoadingSpec | null) => Promise<void>;
  onSetMissingPlates: (plates: number[]) => Promise<void>;
}

type Row = { from: string; to: string; step: string };

function rowsFrom(spec: LoadingSpec | null, kind: 'stack' | 'dumbbells'): Row[] {
  if (spec && spec.kind !== 'plates' && spec.ranges.length > 0) {
    return spec.ranges.map((range) => ({
      from: String(range.from),
      to: String(range.to),
      step: String(range.step),
    }));
  }
  return kind === 'stack'
    ? [{ from: '10', to: '200', step: '10' }]
    : [{ from: '5', to: '50', step: '5' }];
}

function parseRows(rows: Row[]): LoadingRange[] | null {
  const ranges: LoadingRange[] = [];
  for (const row of rows) {
    if (row.from === '' && row.to === '' && row.step === '') continue;
    const from = Number(row.from);
    const to = Number(row.to);
    const step = Number(row.step);
    if (![from, to, step].every(Number.isFinite) || step <= 0 || from < 0 || to < from) return null;
    ranges.push({ from, to, step });
  }
  return ranges.length > 0 ? ranges : null;
}

/**
 * Records what this place can load, from the Plates panel, once: a machine's
 * stack or the dumbbells as ranges with a step, or which plates the rack has.
 * A plate missing today is a session-only note. Every target then lands on a
 * weight that exists here. Nothing is applied without the Save tap.
 */
export function LoadingEditor({
  exercise,
  units,
  loading,
  spec,
  placeName,
  missingPlates,
  onSave,
  onSetMissingPlates,
}: LoadingEditorProps) {
  const key = loadingKeyFor(exercise);
  const kind: 'stack' | 'dumbbells' | 'plates' =
    key === PLATES_KEY ? 'plates' : key === DUMBBELLS_KEY ? 'dumbbells' : 'stack';
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(spec, kind === 'plates' ? 'stack' : kind));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (kind === 'plates') {
    const rack = spec?.kind === 'plates' ? spec.perSide : PLATE_INVENTORY[units];
    const onRack = new Set(rack);
    const missing = new Set(missingPlates);
    const togglePlate = (plate: number) => {
      const next = PLATE_INVENTORY[units].filter((size) =>
        size === plate ? !onRack.has(size) : onRack.has(size),
      );
      void run(() => onSave(next.length > 0 ? { kind: 'plates', perSide: next } : null));
    };
    const toggleMissing = (plate: number) => {
      const next = missing.has(plate)
        ? missingPlates.filter((size) => size !== plate)
        : [...missingPlates, plate];
      void run(() => onSetMissingPlates(next));
    };
    return (
      <div data-testid="loading-editor" data-kind="plates">
        <p className={styles.panelLabel}>Plates at {placeName}, per side</p>
        <div className={styles.chips} role="group" aria-label={`Plates at ${placeName}`}>
          {PLATE_INVENTORY[units].map((plate) => (
            <button
              key={plate}
              type="button"
              className={styles.chip}
              aria-pressed={onRack.has(plate)}
              onClick={() => togglePlate(plate)}
              disabled={busy}
              data-testid={`plate-${plate}`}
            >
              {plate}
            </button>
          ))}
        </div>
        <p className={styles.panelLabel}>Not today</p>
        <div className={styles.chips} role="group" aria-label="Plates missing today">
          {rack.map((plate) => (
            <button
              key={plate}
              type="button"
              className={styles.chip}
              aria-pressed={missing.has(plate)}
              onClick={() => toggleMissing(plate)}
              disabled={busy}
              data-testid={`missing-${plate}`}
            >
              {plate}
            </button>
          ))}
        </div>
        <p className={styles.panelNote}>
          Targets land on what the rack can make: with the smallest plate {loading.step / 2}, the
          bar moves by {loading.step} {units}. Not today lasts this session only.
        </p>
        {problem ? <p className={styles.panelNote}>{problem}</p> : null}
      </div>
    );
  }

  const title =
    kind === 'stack' ? `This machine's stack at ${placeName}` : `Dumbbells at ${placeName}`;
  const hint =
    kind === 'stack'
      ? 'The totals on the stack, as one or two ranges with a step.'
      : 'The weight of one dumbbell, as one or two ranges with a step.';

  if (!editing) {
    return (
      <div data-testid="loading-editor" data-kind={kind}>
        <p className={styles.panelLabel}>{title}</p>
        <p className={styles.panelNote} data-testid="loading-summary">
          {spec && spec.kind !== 'plates'
            ? `${describeSpec(spec, units)}. Targets land on these; the heaviest is ${loading.cap} ${units}.`
            : `Not recorded yet, so targets move by ${loading.step} ${units}. ${hint}`}
        </p>
        <div className={styles.panelActions}>
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => setEditing(true)}
            data-testid="loading-edit"
          >
            {spec ? 'Change' : 'Record it'}
          </button>
        </div>
      </div>
    );
  }

  const update = (index: number, field: keyof Row, value: string) =>
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, [field]: value } : row)),
    );

  return (
    <div data-testid="loading-editor" data-kind={kind}>
      <p className={styles.panelLabel}>{title}</p>
      <p className={styles.panelNote}>{hint}</p>
      {rows.map((row, index) => (
        <div className={formStyles.inputRow} key={index} data-testid={`loading-row-${index}`}>
          <input
            className={formStyles.input}
            type="number"
            inputMode="decimal"
            aria-label={`Range ${index + 1} from`}
            placeholder="from"
            value={row.from}
            onChange={(event) => update(index, 'from', event.target.value)}
          />
          <input
            className={formStyles.input}
            type="number"
            inputMode="decimal"
            aria-label={`Range ${index + 1} to`}
            placeholder="to"
            value={row.to}
            onChange={(event) => update(index, 'to', event.target.value)}
          />
          <input
            className={formStyles.input}
            type="number"
            inputMode="decimal"
            aria-label={`Range ${index + 1} step`}
            placeholder="step"
            value={row.step}
            onChange={(event) => update(index, 'step', event.target.value)}
          />
        </div>
      ))}
      <div className={styles.panelActions}>
        {rows.length < 2 ? (
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => setRows((current) => [...current, { from: '', to: '', step: '' }])}
          >
            Then a second range
          </button>
        ) : null}
        <button
          type="button"
          className={styles.smallButton}
          onClick={() => {
            const ranges = parseRows(rows);
            if (!ranges) {
              setProblem('Each range needs a from, a to at or above it, and a step above zero.');
              return;
            }
            void run(async () => {
              await onSave({ kind, ranges });
              setEditing(false);
            });
          }}
          disabled={busy}
          data-testid="loading-save"
        >
          Save for {placeName}
        </button>
        {spec ? (
          <button
            type="button"
            className={styles.smallButton}
            onClick={() =>
              void run(async () => {
                await onSave(null);
                setRows(rowsFrom(null, kind));
                setEditing(false);
              })
            }
            disabled={busy}
          >
            Forget
          </button>
        ) : null}
        <button
          type="button"
          className={styles.smallButton}
          onClick={() => setEditing(false)}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      {problem ? (
        <p className={styles.panelNote} role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
