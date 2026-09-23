import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { painPatterns } from '../scoring/analytics';
import { interpretFatigue } from './fatigue';
import { lastPainReport, painNextLine, painSourceLine, ratingPainWords } from './painReport';

function rated(daysAgo: number, rating: WorkoutRecord['rating'], title?: string): WorkoutRecord {
  return { ...record(daysAgo, 'barbell-bench-press', [[5, 185, 2]]), rating, title };
}

const shoulder = {
  effort: 'right',
  pain: true,
  joint: 'shoulder',
  energyAfter: 3,
  note: '',
} as const;

describe('the pain reported when a workout is saved', () => {
  it('reads the newest saved workout, and only when it says where', () => {
    const report = lastPainReport([rated(2, shoulder, 'Upper body')]);
    expect(report).toMatchObject({ joint: 'shoulder', title: 'Upper body' });
    expect(painSourceLine(report!)).toBe('Sep 8, Upper body: shoulder');
    // A workout saved later without pain answers the question again.
    expect(lastPainReport([rated(2, shoulder), rated(1, null)])).toBeNull();
    // Pain without where names nothing.
    expect(lastPainReport([rated(2, { ...shoulder, joint: undefined })])).toBeNull();
    // It stays "last time" however long the break, until the next workout is saved; a record with
    // no title reads as a Workout.
    expect(lastPainReport([rated(60, shoulder)])?.title).toBe('Workout');
  });

  it('says it plainly, and promises only what the coach does', () => {
    expect(ratingPainWords(shoulder)).toBe('shoulder pain');
    expect(ratingPainWords({ ...shoulder, joint: 'lower-back' })).toBe('lower back pain');
    expect(ratingPainWords({ ...shoulder, joint: undefined })).toBe('pain');
    expect(ratingPainWords({ ...shoulder, pain: false })).toBeNull();
    expect(painNextLine(shoulder)).toBe(
      'Shoulder pain noted: next time the coach flags exercises that load it.',
    );
    expect(painNextLine({ ...shoulder, joint: undefined })).toBe('Pain noted.');
    // No exercise loads the neck, so nothing is promised for it.
    expect(painNextLine({ ...shoulder, joint: 'neck' })).toBe('Neck pain noted.');
    expect(painNextLine(null)).toBeNull();
  });

  it('counts the joint in the pain patterns and names it in the fatigue evidence', () => {
    const history = [rated(1, shoulder), rated(3, { ...shoulder, joint: undefined })];
    expect(painPatterns(history).value).toEqual([
      { joint: 'shoulder', count: 1 },
      { joint: 'unspecified', count: 1 },
    ]);
    expect(interpretFatigue(history, RECORD_NOW, null).evidence).toContain(
      'Shoulder pain reported in a recent session.',
    );
  });
});
