import type { ReactNode } from 'react';
import styles from './Form.module.css';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}

/** Label + optional hint + control, used by every editor. */
export function Field({ label, hint, error, htmlFor, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        {htmlFor ? (
          <label className={styles.label} htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className={styles.label}>{label}</span>
        )}
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
