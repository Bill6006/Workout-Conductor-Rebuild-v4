import type { LabelledOption } from '../../features/profile/labels';
import styles from './Form.module.css';

interface ChipSelectProps<T extends string> {
  label: string;
  values: readonly T[];
  options: readonly LabelledOption<T>[];
  onChange: (values: T[]) => void;
  layout?: 'wrap' | 'grid-2' | 'grid-3';
  compact?: boolean;
}

/** Multi-select chips (toggle-button semantics). */
export function ChipSelect<T extends string>({
  label,
  values,
  options,
  onChange,
  layout = 'wrap',
  compact = true,
}: ChipSelectProps<T>) {
  const containerClass =
    layout === 'grid-2' ? styles.chipsGrid : layout === 'grid-3' ? styles.chipsGrid3 : styles.chips;
  const chipClass = compact ? `${styles.chip} ${styles.chipCompact}` : styles.chip;

  function toggle(value: T) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return (
    <div role="group" aria-label={label} className={containerClass}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={values.includes(option.value)}
          className={chipClass}
          onClick={() => toggle(option.value)}
        >
          <span>{option.label}</span>
          {option.description ? (
            <span className={styles.chipDescription}>{option.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
