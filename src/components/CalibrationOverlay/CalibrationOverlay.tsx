import { Button } from '../Button/Button';
import { useAppState, useAppStore } from '../../core/state/useAppStore';
import styles from './CalibrationOverlay.module.css';

/**
 * The dedicated calibration state. It appears the moment a recalibration
 * starts, covers the screen so a stray tap cannot corrupt the rebuild, keeps
 * the page where it was, names the trigger and what the engine is evaluating,
 * and turns into a readable error (with the previous workout kept) when the
 * engine fails. It never adds an artificial delay beyond a brief transition.
 */
export function CalibrationOverlay() {
  const { calibration } = useAppState();
  const store = useAppStore();
  if (calibration.status === 'idle') return null;
  const running = calibration.status === 'running';

  return (
    <div
      className={styles.backdrop}
      data-testid="calibration-overlay"
      data-status={calibration.status}
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-busy={running}
      aria-label={running ? 'Recalibrating' : 'Recalibration failed'}
    >
      <div className={styles.card}>
        {running ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            <p className={styles.eyebrow}>Recalibrating · {calibration.label}</p>
            <h2 className={styles.title}>{calibration.title}</h2>
            <ul className={styles.list} aria-label="What the engine is evaluating">
              {calibration.evaluating.map((line, index) => (
                <li
                  key={line}
                  className={styles.item}
                  style={{ animationDelay: `${index * 110}ms` }}
                >
                  {line}
                </li>
              ))}
            </ul>
            <p className={styles.note}>Logged sets are safe. Taps are paused for a moment.</p>
          </>
        ) : (
          <>
            <p className={`${styles.eyebrow} ${styles.eyebrowError}`}>Recalibration failed</p>
            <h2 className={styles.title}>Your previous workout is unchanged</h2>
            <p className={styles.error}>{calibration.error}</p>
            <Button variant="primary" onClick={() => store.dismissCalibrationError()}>
              Keep previous workout
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
