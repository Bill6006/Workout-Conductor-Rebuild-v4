import styles from './Form.module.css';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Switch with a big touch target; the whole row toggles. */
export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
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
