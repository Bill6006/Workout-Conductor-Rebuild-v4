import { describe, expect, it } from 'vitest';
import type { MaxPreview } from '../../core/state/appStore';
import { previewText } from './maxPreviewText';

/** Maintenance 25, the owner's item 36: what the max sheet's preview says for each outcome. */

const target = { weight: 20, reps: [26, 30] as [number, number], rir: 1 };
const preview = (outcome: MaxPreview['outcome'], stays = true): MaxPreview => ({
  e1rm: 100,
  outcome,
  target,
  lines: [],
  stays,
});

describe('the max sheet’s preview', () => {
  it('says what holds a target the max asks more of (from the second and third reviews)', () => {
    const held = (heldBy: MaxPreview['heldBy']) =>
      previewText(
        { ...preview('held'), heldBy },
        'max',
        'Incline Dumbbell Press',
        'lb',
        ' per hand',
        false,
      );
    expect(held('weights')).toBe(
      'Max 100 lb per hand. Today’s target stays 20 lb × 26-30 reps at RIR 1: the max asks for more than the weights here make.',
    );
    expect(held('hand')).toBe(
      'Max 100 lb per hand. Today’s target stays 20 lb × 26-30 reps at RIR 1: the max asks for more than the weights here and the reps you set allow.',
    );
    // A deload week's lighter load rounds the move away: the weights here are not what held it.
    expect(held('deload')).toBe(
      'Max 100 lb per hand. Today’s target stays 20 lb × 26-30 reps at RIR 1: this deload week’s lighter loads round it to the same weight.',
    );
  });

  it('never says the logged sets say as much for a target the weights hold', () => {
    expect(
      previewText(preview('held'), 'max', 'Incline Dumbbell Press', 'lb', '', false),
    ).not.toContain('logged sets already say as much');
  });

  it('says a target moved since the plan was made without calling it one that stays', () => {
    expect(previewText(preview('kept', false), 'max', 'Barbell Bench Press', 'lb', '', false)).toBe(
      'Max 100 lb. Today’s target: 20 lb × 26-30 reps at RIR 1. Your logged sets already say as much as this max.',
    );
  });
});
