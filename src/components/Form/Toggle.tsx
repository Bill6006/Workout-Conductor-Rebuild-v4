import styles from './Form.module.css';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /**
   * Held while a change it would race is being saved: it ignores presses but keeps the keyboard
   * focus, which a disabled button loses (the tenth review's second re-check).
   */
  disabled?: boolean;
}

/** Switch with a big touch target; the whole row toggles. */
export function Toggle({ label, description, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      className={styles.toggle}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        {description ? <span className={styles.toggleDescription}>{description}</span> : null}
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </button>
  );
}
