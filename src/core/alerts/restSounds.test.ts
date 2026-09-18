import { describe, expect, it } from 'vitest';
import { RestSounds, type ToneOutput } from './restSounds';

function recorder(clock = 100) {
  const tones: { at: number; frequency: number; seconds: number; stopped: boolean }[] = [];
  let unlocked = 0;
  const output: ToneOutput = {
    now: () => clock,
    unlock: () => {
      unlocked += 1;
    },
    tone: (at, frequency, seconds) => {
      const tone = { at, frequency, seconds, stopped: false };
      tones.push(tone);
      return {
        stop: () => {
          tone.stopped = true;
        },
      };
    },
  };
  return { output, tones, unlocked: () => unlocked };
}

const END = '2026-09-18T12:00:03.400Z';

describe('the rest timer sounds', () => {
  it('lays three short ticks and one longer tone onto the audio clock, on the second', () => {
    const { output, tones } = recorder(100);
    new RestSounds(output).schedule(END, 3.4);
    expect(tones.map((tone) => Math.round(tone.at * 10) / 10)).toEqual([
      100.4, 101.4, 102.4, 103.4,
    ]);
    const [tick, , , done] = tones;
    expect(done?.seconds).toBeGreaterThan((tick?.seconds ?? 0) * 3);
    expect(done?.frequency).not.toBe(tick?.frequency);
  });

  it('lays a rest once, however often it is asked', () => {
    const { output, tones } = recorder();
    const sounds = new RestSounds(output);
    sounds.schedule(END, 3.4);
    sounds.schedule(END, 2.9);
    expect(tones).toHaveLength(4);
  });

  it('cancels what it laid when the rest is adjusted, paused, or skipped', () => {
    const { output, tones } = recorder();
    const sounds = new RestSounds(output);
    sounds.schedule(END, 3.4);
    sounds.schedule('2026-09-18T12:00:18.400Z', 3.4);
    expect(tones.slice(0, 4).every((tone) => tone.stopped)).toBe(true);
    expect(tones.slice(4).every((tone) => !tone.stopped)).toBe(true);
    sounds.cancel();
    expect(tones.every((tone) => tone.stopped)).toBe(true);
  });

  it('passes the unlock to the output, for the tap that lets the browser play sound', () => {
    const { output, unlocked } = recorder();
    new RestSounds(output).unlock();
    expect(unlocked()).toBe(1);
  });
});
