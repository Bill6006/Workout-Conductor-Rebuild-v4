import { cuesAhead } from './cues';

/**
 * The rest timer's sounds. Cues are laid onto the audio clock a few seconds
 * ahead, so they land on the second even when the page is busy, and they are
 * cancelled the moment the rest is adjusted, paused, or skipped. The browser
 * only lets a page make sound after a tap, so `unlock` is called from the taps
 * that start a rest. Web audio cannot see the phone's silent switch; the
 * Settings switch is the control.
 */

export interface ToneHandle {
  stop(): void;
}

/** Where tones go: the speaker in the app, a recorder in tests. */
export interface ToneOutput {
  /** The output's own clock, in seconds. */
  now(): number;
  unlock(): void;
  tone(at: number, frequency: number, seconds: number, peak: number): ToneHandle;
}

const TICK = { frequency: 880, seconds: 0.09, peak: 0.22 } as const;
const DONE = { frequency: 1175, seconds: 0.7, peak: 0.3 } as const;

export class RestSounds {
  private pending: ToneHandle[] = [];
  private scheduledFor: string | null = null;
  private readonly output: ToneOutput;

  constructor(output: ToneOutput) {
    this.output = output;
  }

  unlock(): void {
    this.output.unlock();
  }

  /** Lays the cues for the rest that ends in `remaining` seconds, once per end time. */
  schedule(endsAt: string, remaining: number): void {
    if (this.scheduledFor === endsAt) return;
    this.cancel();
    this.scheduledFor = endsAt;
    const start = this.output.now();
    for (const cue of cuesAhead(remaining)) {
      const shape = cue.kind === 'tick' ? TICK : DONE;
      this.pending.push(
        this.output.tone(start + cue.inSeconds, shape.frequency, shape.seconds, shape.peak),
      );
    }
  }

  cancel(): void {
    for (const handle of this.pending) handle.stop();
    this.pending = [];
    this.scheduledFor = null;
  }
}

type AudioContextCtor = typeof AudioContext;

/** The speaker, through Web Audio; silent where the browser has none. */
export function createWebAudioOutput(): ToneOutput {
  let context: AudioContext | null = null;
  const ensure = (): AudioContext | null => {
    if (context) return context;
    if (typeof window === 'undefined') return null;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      context = null;
    }
    return context;
  };
  return {
    now: () => ensure()?.currentTime ?? 0,
    unlock: () => {
      const audio = ensure();
      if (audio && audio.state === 'suspended') void audio.resume().catch(() => undefined);
    },
    tone: (at, frequency, seconds, peak) => {
      const audio = ensure();
      if (!audio) return { stop: () => undefined };
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + seconds + 0.05);
      return {
        stop: () => {
          try {
            gain.gain.cancelScheduledValues(0);
            gain.gain.setValueAtTime(0.0001, audio.currentTime);
            oscillator.stop();
          } catch {
            // already stopped
          }
        },
      };
    },
  };
}

/** The app's one speaker; it touches no audio until the first unlock or tone. */
const speaker = createWebAudioOutput();

/** The rest's player. */
export const restSounds = new RestSounds(speaker);

/**
 * A hold's player: the same ticks and end tone through the same speaker, so the tap that unlocks
 * one unlocks both, and neither cancels the other.
 */
export const holdSounds = new RestSounds(speaker);
