import { useEffect, useRef } from 'react';
import type { RestState } from '../../core/state/session';
import { useTicker } from '../../core/time/useTicker';
import styles from './RestTimer.module.css';

interface RestTimerProps {
  rest: RestState;
  paused: boolean;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
}

function format(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/**
 * Rest timer driven by an absolute end time, so it keeps counting across
 * screen changes and backgrounding and freezes exactly while the workout is
 * paused. Completion is a visible state change plus one short vibration where
 * the device allows it; there is no sound.
 */
export function RestTimer({ rest, paused, onAdjust, onSkip }: RestTimerProps) {
  const now = useTicker(500, !paused);
  const remaining =
    rest.pausedRemaining !== null && paused
      ? rest.pausedRemaining
      : (Date.parse(rest.endsAt) - now) / 1000;
  const done = remaining <= 0;
  const fraction = rest.seconds > 0 ? Math.min(1, Math.max(0, 1 - remaining / rest.seconds)) : 1;
  const fired = useRef(false);

  useEffect(() => {
    if (!done || fired.current) return;
    fired.current = true;
    try {
      navigator.vibrate?.([120, 60, 120]);
    } catch {
      // vibration is optional
    }
  }, [done]);

  return (
    <div
      className={styles.timer}
      role="timer"
      aria-live="polite"
      aria-label={done ? 'Rest done' : `Rest, ${format(remaining)} left`}
      data-testid="rest-timer"
      data-done={done ? 'true' : 'false'}
    >
      <div
        className={styles.ring}
        style={{ ['--fraction' as string]: fraction }}
        aria-hidden="true"
      >
        <span className={styles.clock}>{done ? 'Go' : format(remaining)}</span>
      </div>
      <div className={styles.body}>
        <span className={styles.title}>
          {done ? 'Rest done' : paused ? 'Rest paused' : 'Resting'}
          <span className={styles.programmed}> · {format(rest.seconds)} planned</span>
        </span>
        <span className={styles.next}>{rest.nextLabel}</span>
        <div className={styles.controls}>
          <button type="button" className={styles.adjust} onClick={() => onAdjust(-15)}>
            −15 s
          </button>
          <button type="button" className={styles.adjust} onClick={() => onAdjust(15)}>
            +15 s
          </button>
          <button
            type="button"
            className={`${styles.adjust} ${styles.skip}`}
            onClick={onSkip}
            data-testid="skip-rest"
          >
            {done ? 'Continue' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
}
