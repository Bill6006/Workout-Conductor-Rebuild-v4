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
  /** The rack of plates is edited rarely; a plate missing today is the everyday case. */
  const [editingRack, setEditingRack] = useState(false);
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
    const inventory = PLATE_INVENTORY[units];
    const rack = spec?.kind === 'plates' ? spec.perSide : inventory;
    const onRack = new Set(rack);
    const missing = new Set(missingPlates);
    const togglePlate = (plate: number) => {
      const next = inventory.filter((size) =>
        size === plate ? !onRack.has(size) : onRack.has(size),
      );
      // The last plate stays; the full set needs no record of its own.
      if (next.length === 0) return;
      void run(() =>
        onSave(next.length < inventory.length ? { kind: 'plates', perSide: next } : null),
      );
    };
    const toggleMissing = (plate: number) => {
      const next = missing.has(plate)
        ? missingPlates.filter((size) => size !== plate)
        : [...missingPlates, plate];
      void run(() => onSetMissingPlates(next));
    };
    const gone = rack.filter((plate) => missing.has(plate));
    const note = editingRack
      ? `Tap a plate ${placeName} does not have.`
      : gone.length > 0
        ? `No ${gone.join(' or ')} today: the bar moves by ${loading.step} ${units}. Back next workout.`
        : `The bar moves by ${loading.step} ${units}.`;
    // One row, two plain meanings. Every day: tap the plate you cannot find, for this workout
    // only. Once per place: Edit rack, and tap what the place never has.
    return (
      <div
        data-testid="loading-editor"
        data-kind="plates"
        data-mode={editingRack ? 'rack' : 'today'}
      >
        <div className={styles.panelHead}>
          <p className={styles.panelLabel}>
            {editingRack ? `Plates at ${placeName}` : 'Missing a plate today? Tap it'}
          </p>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setEditingRack((current) => !current)}
            data-testid="rack-edit"
          >
            {editingRack ? 'Done' : 'Edit rack'}
          </button>
        </div>
        <div
          className={styles.chips}
          role="group"
          aria-label={editingRack ? `Plates at ${placeName}` : 'Plates missing today'}
        >
          {(editingRack ? inventory : rack).map((plate) => {
            const off = editingRack ? !onRack.has(plate) : missing.has(plate);
            const state = editingRack
              ? off
                ? `not at ${placeName}`
                : `at ${placeName}`
              : off
                ? 'missing today'
                : 'on the rack';
            return (
              <button
                key={plate}
                type="button"
                className={styles.plateChip}
                data-state={off ? 'off' : 'on'}
                aria-pressed={editingRack ? !off : off}
                aria-label={`${plate} ${units}, ${state}`}
                onClick={() => (editingRack ? togglePlate(plate) : toggleMissing(plate))}
                disabled={busy}
                data-testid={editingRack ? `plate-${plate}` : `missing-${plate}`}
              >
                {plate}
              </button>
            );
          })}
          {editingRack && rack.length < inventory.length ? (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => void run(() => onSave(null))}
              disabled={busy}
              data-testid="rack-all"
            >
              All plates
            </button>
          ) : null}
        </div>
        <p className={styles.panelNote} data-testid="loading-note">
          {note}
        </p>
        {problem ? <p className={styles.panelNote}>{problem}</p> : null}
      </div>
    );
  }

  const title =
    kind === 'stack' ? `This machine's weights at ${placeName}` : `Dumbbells at ${placeName}`;
  const hint =
    kind === 'stack'
      ? 'The lightest setting on the stack, the heaviest, and the jump between pins.'
      : 'One dumbbell: the lightest you have, the heaviest, and the jump between sizes.';
  const parsed = parseRows(rows);
  // What the boxes add up to, read back in words as they are typed.
  const readBack =
    parsed === null
      ? null
      : parsed
          .map((range) => `${range.from} to ${range.to} ${units} in ${range.step} ${units} jumps`)
          .join(', then ');

  if (!editing) {
    return (
      <div data-testid="loading-editor" data-kind={kind}>
        <p className={styles.panelLabel}>{title}</p>
        <p className={styles.panelNote} data-testid="loading-summary">
          {spec && spec.kind !== 'plates'
            ? `${describeSpec(spec, units)}. Targets land on these and stop at ${loading.cap} ${units}.`
            : `Not set yet, so targets move by ${loading.step} ${units} with no upper limit.`}
        </p>
        <div className={styles.panelActions}>
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => setEditing(true)}
            data-testid="loading-edit"
          >
            {spec ? 'Change' : kind === 'stack' ? 'Set this machine' : 'Set my dumbbells'}
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
        <div className={styles.rangeRow} key={index} data-testid={`loading-row-${index}`}>
          {(
            [
              ['from', 'Lightest'],
              ['to', 'Heaviest'],
              ['step', 'Jump'],
            ] as const
          ).map(([field, label]) => (
            <label className={styles.rangeField} key={field}>
              <span className={styles.rangeLabel}>
                {label} ({units})
              </span>
              <input
                className={formStyles.input}
                type="number"
                inputMode="decimal"
                aria-label={`${label}${rows.length > 1 ? `, range ${index + 1}` : ''}`}
                value={row[field]}
                onChange={(event) => update(index, field, event.target.value)}
              />
            </label>
          ))}
        </div>
      ))}
      <p className={styles.panelNote} data-testid="loading-readback">
        {readBack ?? 'Fill in all three: lightest, heaviest, and the jump.'}
      </p>
      <div className={styles.panelActions}>
        {rows.length < 2 ? (
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => setRows((current) => [...current, { from: '', to: '', step: '' }])}
          >
            The jump changes higher up
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
