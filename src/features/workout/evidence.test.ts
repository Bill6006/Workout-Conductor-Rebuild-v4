import { describe, expect, it } from 'vitest';
import { EFFORT_EVIDENCE, REST_EVIDENCE } from './effort';
import { evidenceLines, leadFor } from './evidence';
import { TEMPO_EVIDENCE } from './tempo';

describe('skimmable evidence', () => {
  it('gives every line a lead, drops the duplicate ramp line, and hides the rest-style line by default', () => {
    const lines = evidenceLines([
      TEMPO_EVIDENCE.ramp,
      TEMPO_EVIDENCE.duration,
      EFFORT_EVIDENCE.ramp,
      EFFORT_EVIDENCE.scale,
      REST_EVIDENCE.strength,
      REST_EVIDENCE.style,
    ]);
    expect(lines.map((line) => line.lead)).toEqual([
      'Ramp sets',
      'Rep speed',
      'Effort scale',
      'Rest',
    ]);
    expect(lines[0]?.text).toBe(TEMPO_EVIDENCE.ramp);
  });

  it('keeps the rest-style line when a style other than Standard is set', () => {
    const lines = evidenceLines([REST_EVIDENCE.hypertrophy, REST_EVIDENCE.style], {
      restStyle: 'long',
    });
    expect(lines.map((line) => line.lead)).toEqual(['Rest', 'Rest style']);
    expect(leadFor('something new')).toBe('Evidence');
  });
});
