import { DURATION_CHOICES, durationLabel, isDurationChoice } from '../../engine/duration/duration';
import type { DurationChoice } from '../../engine/workout/types';
import styles from './DurationSelector.module.css';

interface DurationSelectorProps {
  choice: DurationChoice;
  defaultMinutes: number;
  onChange: (choice: DurationChoice) => void;
  id?: string;
}

/**
 * The one workout-length control: a quick dropdown with 15, 30, 45, and
 * Default time. Native select so Android opens its own picker.
 */
export function DurationSelector({
  choice,
  defaultMinutes,
  onChange,
  id = 'duration-select',
}: DurationSelectorProps) {
  return (
    <label className={styles.control} htmlFor={id}>
      <span className={styles.label}>Workout length</span>
      <span className={styles.selectWrap}>
        <select
          id={id}
          className={styles.select}
          value={String(choice)}
          data-testid="duration-select"
          onChange={(event) => {
            const raw = event.target.value;
            const parsed = raw === 'default' ? 'default' : Number(raw);
            if (isDurationChoice(parsed)) onChange(parsed);
          }}
        >
          {DURATION_CHOICES.map((option) => (
            <option key={String(option)} value={String(option)}>
              {durationLabel(option, defaultMinutes)}
            </option>
          ))}
        </select>
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </span>
    </label>
  );
}
