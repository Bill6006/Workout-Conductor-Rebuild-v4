import styles from './Form.module.css';

interface NumberFieldProps {
  id: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  unit?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
}

/** Numeric input with decimal keyboard on Android; empty means "not set". */
export function NumberField({
  id,
  value,
  onChange,
  unit,
  placeholder,
  min,
  max,
  step,
  ariaLabel,
}: NumberFieldProps) {
  return (
    <div className={styles.inputRow}>
      <input
        id={id}
        className={styles.input}
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            onChange(undefined);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
      {unit ? <span className={styles.unit}>{unit}</span> : null}
    </div>
  );
}
