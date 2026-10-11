import { cuesAhead } from './cues';

/**
 * The rest timer's vibration, alongside its sounds (Maintenance 29, the owner's item 7: "Vibration
 * alongside the rest sounds, one switch for both"): a short buzz with each tick and a double buzz
 * with the end tone. The pattern starts with the first cue still ahead, and stops the moment the
 * rest is adjusted, paused or skipped. A phone buzzes only while the app is in view, after a tap;
 * an iPhone's browser does not at all, and there nothing happens.
 */

/** A tick's buzz, in milliseconds. */
export const TICK_BUZZ_MS = 60;
/** The end's buzz: on, off, on, in milliseconds. */
export const DONE_BUZZ_MS: readonly number[] = [120, 60, 120];

export interface BuzzPlan {
  /** Seconds until the pattern starts: the first cue still ahead. */
  startIn: number;
  /** Buzz and pause in turn, in milliseconds, as `navigator.vibrate` takes them. */
  pattern: number[];
}

/** The buzzes for a rest `remaining` seconds from its end, or null with none ahead. */
export function buzzPlan(remaining: number): BuzzPlan | null {
  const cues = cuesAhead(remaining);
  const first = cues[0];
  if (!first) return null;
  const pattern: number[] = [];
  cues.forEach((cue, index) => {
    const steps = cue.kind === 'tick' ? [TICK_BUZZ_MS] : DONE_BUZZ_MS;
    pattern.push(...steps);
    const next = cues[index + 1];
    if (next) {
      const length = steps.reduce((sum, step) => sum + step, 0);
      pattern.push(Math.max(0, Math.round((next.inSeconds - cue.inSeconds) * 1000) - length));
    }
  });
  return { startIn: first.inSeconds, pattern };
}

/** Where buzzes go: the phone in the app, a recorder in tests. */
export interface Vibrator {
  vibrate(pattern: number | number[]): boolean;
}

/** The phone, where its browser can buzz; null where it cannot. */
export function phoneVibrator(): Vibrator | null {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return null;
  return { vibrate: (pattern) => navigator.vibrate(pattern) };
}

export class RestBuzz {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private buzzing = false;
  private scheduledFor: string | null = null;
  private readonly vibrator: () => Vibrator | null;

  constructor(vibrator: () => Vibrator | null) {
    this.vibrator = vibrator;
  }

  /** Lays the buzzes for the rest that ends in `remaining` seconds, once per end time. */
  schedule(endsAt: string, remaining: number): void {
    if (this.scheduledFor === endsAt) return;
    this.cancel();
    const plan = buzzPlan(remaining);
    if (!plan) return;
    this.scheduledFor = endsAt;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.buzzing = this.send(plan.pattern);
    }, plan.startIn * 1000);
  }

  /** Stops what is laid, and a pattern already buzzing. */
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.buzzing) this.send(0);
    this.buzzing = false;
    this.scheduledFor = null;
  }

  private send(pattern: number | number[]): boolean {
    try {
      return this.vibrator()?.vibrate(pattern) ?? false;
    } catch {
      // vibration is optional
      return false;
    }
  }
}

/** The rest's buzzes. */
export const restBuzz = new RestBuzz(phoneVibrator);

/** A hold's buzzes: its own, so neither cancels the other. */
export const holdBuzz = new RestBuzz(phoneVibrator);
