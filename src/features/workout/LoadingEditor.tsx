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
 * Records what this place can load, from the Plates panel: a machine's stack or the dumbbells as
 * ranges with a step, saved with the Save tap; or, for a bar, the plates in two modes that apply
 * each tap at once (Maintenance 25, item 8): Today, a plate missing for this workout only, and
 * Default, the plates this place keeps, saved for it. Every target then lands on a weight that
 * exists here.
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
  /** Today is the everyday case, a plate missing for this workout; Default is the place's rack. */
  const [plateMode, setPlateMode] = useState<'today' | 'default'>('today');
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
    const isDefault = plateMode === 'default';
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
    // With every plate the place keeps missing today, nothing goes on the bar: it does not move.
    const none = gone.length === rack.length;
    const note = isDefault
      ? `Saved for ${placeName}: tap a plate it never has.`
      : none
        ? 'No plates today: the bar stays empty. Back next workout.'
        : gone.length > 0
          ? `No ${gone.join(' or ')} today: the bar moves by ${loading.step} ${units}. Back next workout.`
          : `The bar moves by ${loading.step} ${units}.`;
    // Two modes, each change applied at once (Maintenance 25, item 8). Today: a plate you cannot
    // find, for this workout only. Default: the plates this place keeps, saved for it.
    return (
      <div data-testid="loading-editor" data-kind="plates" data-mode={plateMode}>
        <div className={styles.modeSwitch} role="group" aria-label="Which plates to change">
          {(
            [
              ['today', 'Today'],
              ['default', 'Default'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={styles.modeButton}
              aria-pressed={plateMode === mode}
              onClick={() => setPlateMode(mode)}
              data-testid={`plates-mode-${mode}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={styles.panelLabel} data-testid="plates-mode-hint">
          {isDefault ? `Plates at ${placeName}` : 'Missing a plate today? Tap it'}
        </p>
        <div
          className={styles.plateButtons}
          role="group"
          aria-label={isDefault ? `Plates at ${placeName}` : 'Plates missing today'}
          data-testid="plate-buttons"
        >
          {(isDefault ? inventory : rack).map((plate) => {
            const off = isDefault ? !onRack.has(plate) : missing.has(plate);
            const state = isDefault
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
                aria-pressed={isDefault ? !off : off}
                aria-label={`${plate} ${units}, ${state}`}
                onClick={() => (isDefault ? togglePlate(plate) : toggleMissing(plate))}
                disabled={busy}
                data-testid={isDefault ? `plate-${plate}` : `missing-${plate}`}
              >
                {plate}
              </button>
            );
          })}
        </div>
        <div className={styles.plateNoteRow}>
          <p className={styles.panelNote} data-testid="loading-note">
            {note}
          </p>
          {isDefault && rack.length < inventory.length ? (
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
        {problem ? (
          <p className={styles.panelNote} role="alert">
            {problem}
          </p>
        ) : null}
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
