import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { TEMPO_EVIDENCE, notation, tempoCue, truncate } from './tempo';

const bench = requireExercise('barbell-bench-press');
const fly = requireExercise('cable-fly');

describe('tempo cues', () => {
  it('follows the set’s job, not the exercise, with lower-pause-lift-squeeze notation', () => {
    expect(tempoCue('primary-strength', 'working', bench).tempo).toBe('2-1-X-0');
    expect(tempoCue('primary-hypertrophy', 'working', bench).tempo).toBe('3-0-1-0');
    expect(tempoCue('isolation', 'working', fly).tempo).toBe('2-0-2-1');
    expect(tempoCue('primary-strength', 'warmup', bench).tempo).toBe('2-0-1-0');
    expect(tempoCue('primary-strength', 'warmup', bench).why).toContain('ramp set');
    expect(tempoCue('isolation', 'drop', fly).why).toContain('drop set');
  });

  it('models phases in seconds so a bar can show them in proportion', () => {
    const strength = tempoCue('primary-strength', 'working', bench);
    expect(strength.phases.map((phase) => phase.key)).toEqual(['lower', 'hold', 'lift', 'squeeze']);
    expect(strength.phases[2]).toMatchObject({ fast: true, seconds: 1 });
    expect(strength.totalSeconds).toBe(4);
    expect(notation(strength.phases)).toBe('2-1-X-0');
    const isolation = tempoCue('isolation', 'working', fly);
    expect(isolation.totalSeconds).toBe(5);
  });

  it('carries evidence for every choice and the exercise’s first execution step as the cue', () => {
    const strength = tempoCue('primary-strength', 'working', bench);
    expect(strength.evidence).toContain(TEMPO_EVIDENCE.intent);
    expect(
      strength.evidence.every((line) => /\(.*\d{4}.*\)|coaching practice|never count/.test(line)),
    ).toBe(true);
    expect(tempoCue('isolation', 'working', fly).evidence[0]).toBe(TEMPO_EVIDENCE.squeeze);
    const cue = strength.cue;
    expect(cue).toBe(truncate(bench.instructions.execution[0] as string));
    expect(cue?.length).toBeLessThanOrEqual(72);
    expect(truncate('short')).toBe('short');
  });
});

describe('the reason given for a slow lowering', () => {
  it('is control, not a growth claim the research does not back', () => {
    // Maintenance 23, the owner's item 26 (Amdi and King 2025 found no clear growth benefit).
    const why = tempoCue('primary-hypertrophy', 'working', bench).why;
    expect(why).toBe('lower for 3 under control, no pause, up smoothly');
    expect(why).not.toMatch(/stretch/);
  });
});

describe('tempo at the heaviest weight the place has', () => {
  it('slows the lowering and adds a pause on a working set, and leaves ramps alone', () => {
    const capped = tempoCue('primary-hypertrophy', 'working', bench, { capped: true });
    expect(capped.tempo).toBe('3-1-1-0');
    expect(capped.why).toContain('heaviest weight here');
    expect(tempoCue('primary-hypertrophy', 'working', bench).tempo).toBe('3-0-1-0');
    expect(tempoCue('primary-hypertrophy', 'warmup', bench, { capped: true }).tempo).toBe(
      '2-0-1-0',
    );
    expect(tempoCue('isolation', 'drop', fly, { capped: true }).why).toContain('drop set');
  });

  it('keeps the fast lift on a strength set: 3-1-X-0, the lowering and the pause still slower', () => {
    for (const role of ['primary-strength', 'secondary-strength'] as const) {
      const capped = tempoCue(role, 'working', bench, { capped: true });
      expect(capped.tempo).toBe('3-1-X-0');
      expect(capped.phases[2]).toMatchObject({ fast: true, seconds: 1 });
      expect(capped.why).toContain('heaviest weight here');
      expect(capped.why).toContain('as fast as you can');
      expect(capped.evidence).toContain(TEMPO_EVIDENCE.intent);
    }
    expect(tempoCue('isolation', 'working', fly, { capped: true }).tempo).toBe('3-1-1-0');
  });
});

describe('the research behind a slower lowering', () => {
  it('cites the review that tested lowering speed, not one of lowering-only training', () => {
    expect(TEMPO_EVIDENCE.eccentric).toMatch(/Amdi and King, 2025/);
    expect(TEMPO_EVIDENCE.eccentric).not.toMatch(/Roig/);
  });
});

describe('the length estimate runs at the pace the tempo bar shows', () => {
  it('times a rep exactly as long as the coached tempo takes, for every kind of set', async () => {
    const { REP_SECONDS } = await import('../../engine/duration/duration');
    const bench = requireExercise('barbell-bench-press');
    expect(tempoCue('primary-strength', 'working', bench).totalSeconds).toBe(REP_SECONDS.strength);
    expect(tempoCue('secondary-strength', 'working', bench).totalSeconds).toBe(
      REP_SECONDS.strength,
    );
    expect(tempoCue('primary-hypertrophy', 'working', bench).totalSeconds).toBe(
      REP_SECONDS.hypertrophy,
    );
    expect(tempoCue('isolation', 'working', bench).totalSeconds).toBe(REP_SECONDS.isolation);
    expect(tempoCue('finisher', 'working', bench).totalSeconds).toBe(REP_SECONDS.isolation);
    expect(tempoCue('primary-strength', 'warmup', bench).totalSeconds).toBe(REP_SECONDS.warmup);
    expect(tempoCue('isolation', 'drop', bench).totalSeconds).toBe(REP_SECONDS.drop);
    expect(tempoCue('primary-hypertrophy', 'working', bench, { capped: true }).totalSeconds).toBe(
      REP_SECONDS.capped,
    );
    // A fast lift counts as one second, so the heaviest-weight tempo times the same either way.
    expect(tempoCue('primary-strength', 'working', bench, { capped: true }).totalSeconds).toBe(
      REP_SECONDS.capped,
    );
    expect(tempoCue('isolation', 'working', bench, { capped: true }).totalSeconds).toBe(
      REP_SECONDS.capped,
    );
  });
});

describe('a warm-up at bodyweight', () => {
  it('is a few easy reps, with no load to call easy', () => {
    // Maintenance 23, the owner's item 22.
    const chinUp = requireExercise('chin-up');
    expect(tempoCue('primary-hypertrophy', 'warmup', chinUp).why).toBe(
      'ramp set: a few easy reps, rehearse the working tempo',
    );
    expect(tempoCue('primary-strength', 'warmup', bench).why).toBe(
      'ramp set: easy load, rehearse the working tempo',
    );
  });
});
