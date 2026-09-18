import { describe, expect, it } from 'vitest';
import { cuesAhead } from './cues';

describe('the last seconds of a rest', () => {
  it('counts in with a tick at three, two and one, and a longer tone at zero', () => {
    const cues = cuesAhead(3.4);
    expect(cues.map((cue) => cue.kind)).toEqual(['tick', 'tick', 'tick', 'done']);
    expect(cues.map((cue) => Math.round(cue.inSeconds * 10) / 10)).toEqual([0.4, 1.4, 2.4, 3.4]);
  });

  it('plays only what is still ahead when the rest is short or cut down', () => {
    expect(cuesAhead(1.5)).toEqual([
      { kind: 'tick', inSeconds: 0.5 },
      { kind: 'done', inSeconds: 1.5 },
    ]);
    expect(cuesAhead(0.4)).toEqual([{ kind: 'done', inSeconds: 0.4 }]);
  });

  it('plays nothing for a rest that is over', () => {
    expect(cuesAhead(0)).toEqual([]);
    expect(cuesAhead(-2)).toEqual([]);
    expect(cuesAhead(Number.NaN)).toEqual([]);
  });
});
