import type { TempoPhase } from '../../features/workout/tempo';
import styles from './TempoBar.module.css';

interface TempoBarProps {
  phases: readonly TempoPhase[];
  totalSeconds: number;
}

/**
 * One rep as a bar: lower, hold, lift, and squeeze segments sized by their
 * seconds, with a marker that sweeps across at the real pace and loops. The
 * labels carry the meaning, so nothing depends on colour, and the marker
 * stops when the viewer prefers reduced motion.
 */
export function TempoBar({ phases, totalSeconds }: TempoBarProps) {
  const shown = phases.filter((phase) => phase.seconds > 0);
  const description = shown
    .map(
      (phase) =>
        `${phase.label.toLowerCase()} ${phase.fast ? 'as fast as you can' : `${phase.seconds} s`}`,
    )
    .join(', ');
  return (
    <div
      className={styles.bar}
      role="img"
      aria-label={`One rep: ${description}`}
      data-testid="tempo-bar"
    >
      <div className={styles.track}>
        {shown.map((phase) => (
          <span
            key={phase.key}
            className={styles.segment}
            data-phase={phase.key}
            style={{ flexGrow: phase.seconds }}
          >
            <span className={styles.segmentLabel}>{phase.label}</span>
            <span className={styles.segmentTime}>{phase.fast ? 'fast' : `${phase.seconds}s`}</span>
          </span>
        ))}
        <span
          className={styles.sweep}
          aria-hidden="true"
          style={{ animationDuration: `${Math.max(1, totalSeconds)}s` }}
        />
      </div>
    </div>
  );
}
