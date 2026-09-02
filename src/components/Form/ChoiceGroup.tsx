import type { LabelledOption } from '../../features/profile/labels';
import styles from './Form.module.css';

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  options: readonly LabelledOption<T>[];
  onChange: (value: T) => void;
  layout?: 'wrap' | 'grid-2' | 'grid-3';
  compact?: boolean;
}

/** Single-select chips (radio semantics). */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  layout = 'wrap',
  compact = false,
}: ChoiceGroupProps<T>) {
  const containerClass =
    layout === 'grid-2' ? styles.chipsGrid : layout === 'grid-3' ? styles.chipsGrid3 : styles.chips;
  const chipClass = compact ? `${styles.chip} ${styles.chipCompact}` : styles.chip;

  return (
    <div role="radiogroup" aria-label={label} className={containerClass}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={chipClass}
          onClick={() => onChange(option.value)}
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
