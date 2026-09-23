import { useEffect, useRef } from 'react';
import { heldSeconds, type HoldState } from '../../core/state/session';
import { useWakeLock } from '../../core/screen/useWakeLock';
import { useTicker } from '../../core/time/useTicker';
import styles from './HoldTimer.module.css';

interface HoldTimerProps {
  /** The countdown for this set, when one was started. */
  hold: HoldState | null;
  /** Today's seconds for the set. */
  seconds: number;
  /** The workout is paused: the countdown is frozen and nothing starts. */
  paused: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

function format(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${(whole % 60).toString().padStart(2, '0')}`;
}

/**
 * A hold's countdown, inside the set logger. Start counts down today's seconds with the rest
 * timer's ticks and end tone (the app-wide alerts play them); Stop ends it early. Either way the
 * seconds held go into the dial, and the set is logged with the usual button. The end time lives
 * on the session, so the countdown freezes with a pause and survives a reload, and the screen
 * stays awake only while it counts.
 */
export function HoldTimer({
  hold,
  seconds,
  paused,
  disabled = false,
  onStart,
  onStop,
}: HoldTimerProps) {
  const counting = hold !== null && hold.held === null && hold.pausedRemaining === null;
  const now = useTicker(250, counting && !paused, hold ? Date.parse(hold.endsAt) : null);
  const finished = hold ? heldSeconds(hold, now) : null;
  const running = hold !== null && finished === null;
  // Never more than the hold's length: the first frame after a start can be a tick behind.
  const remaining = !hold
    ? seconds
    : Math.min(
        hold.seconds,
        hold.pausedRemaining !== null
          ? hold.pausedRemaining
          : (Date.parse(hold.endsAt) - now) / 1000,
      );
  useWakeLock(running && !paused);

  // One buzz as a countdown runs out, once for each countdown. One that had already run out when
  // this timer appeared (back from another tab, the app reopened) has had its end.
  const ranOut = hold !== null && hold.held === null && finished !== null;
  const buzzedFor = useRef<string | null>(ranOut && hold ? hold.endsAt : null);
  useEffect(() => {
    if (!ranOut || !hold || buzzedFor.current === hold.endsAt) return;
    buzzedFor.current = hold.endsAt;
    try {
      navigator.vibrate?.([120, 60, 120]);
    } catch {
      // vibration is optional
    }
  }, [ranOut, hold]);

  if (running && hold) {
    const fraction = hold.seconds > 0 ? Math.min(1, Math.max(0, 1 - remaining / hold.seconds)) : 1;
    return (
      <div className={styles.timer} data-testid="hold-timer" data-state="running">
        <div
          className={styles.clock}
          role="timer"
          aria-live="off"
          aria-label={`Hold, ${format(remaining)} left`}
          data-testid="hold-clock"
        >
          {format(remaining)}
        </div>
        <div className={styles.body}>
          <span className={styles.title}>{paused ? 'Hold paused' : 'Holding'}</span>
          <span className={styles.bar} aria-hidden="true">
            <span className={styles.fill} style={{ ['--fraction' as string]: fraction }} />
          </span>
        </div>
        <button
          type="button"
          className={styles.stop}
          onClick={onStop}
          disabled={disabled}
          data-testid="hold-stop"
        >
          Stop
        </button>
      </div>
    );
  }

  return (
    <div
      className={styles.timer}
      data-testid="hold-timer"
      data-state={finished !== null ? 'done' : 'ready'}
    >
      {finished !== null ? (
        <span className={styles.held} data-testid="hold-held">
          Held {finished} s
        </span>
      ) : null}
      <button
        type="button"
        className={styles.start}
        onClick={onStart}
        disabled={disabled || paused}
        data-testid="hold-start"
      >
        {finished !== null ? `Start again · ${seconds} s` : `Start hold · ${seconds} s`}
      </button>
    </div>
  );
}
