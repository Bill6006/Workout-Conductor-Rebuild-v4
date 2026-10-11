import { describe, expect, it } from 'vitest';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, RECORD_NOW } from '../../test/records';
import { pushCard } from './pushCard';

/**
 * Maintenance 27, the owner's item 44: Progress shows the pace toward a pushed lift's target, a
 * baseline until the pace means something, and a target date against it.
 */

const DAY = 86_400_000;
const base = createDefaultProfile(RECORD_NOW);
const daysAgo = (days: number) => new Date(Date.parse(RECORD_NOW) - days * DAY).toISOString();

function pushing(target: number, sinceDays: number, by?: string): UserProfile {
  return {
    ...base,
    pushLift: {
      exerciseId: 'barbell-bench-press',
      target,
      units: 'lb',
      since: daysAgo(sinceDays),
      ...(by ? { by } : {}),
    },
  };
}

/** Bench sessions twice a week from `days` ago, the first set's max rising `weekly`. */
function sessions(days: number, weekly: number): WorkoutRecord[] {
  const out: WorkoutRecord[] = [];
  for (let day = days; day >= 1; day -= 3.5) {
    const weight = Math.round(185 * (1 + weekly) ** ((days - day) / 7) * 2) / 2;
    out.push(record(day, 'barbell-bench-press', [[5, weight, 2]], [4, 6], 2));
  }
  return out;
}

describe('the push card', () => {
  it('is absent without a push', () => {
    expect(pushCard(base, [], RECORD_NOW)).toBeNull();
  });

  it('names the lift, the target and the date', () => {
    const card = pushCard(pushing(250, 10, '2026-12-01T12:00:00.000Z'), [], RECORD_NOW);
    expect(card?.title).toBe('Barbell Bench Press to 250 lb by Dec 1');
    expect(card?.headline).toBe('No reading yet');
  });

  it('says what a reading is, and why sessions gave none', () => {
    // Light weights: the bench at 15 reps, past what a reading reads (the re-check of item 44).
    const light = [21, 14, 7].map((day) =>
      record(day, 'barbell-bench-press', [[15, 95, 1]], [10, 15], 1),
    );
    const card = pushCard(pushing(250, 22), light, RECORD_NOW);
    expect(card?.headline).toBe('No reading yet');
    expect(card?.lines).toEqual([
      'None of its 3 sessions since the push began gave one: a reading is its first working set each session, at 12 reps or fewer with 3 or fewer in reserve.',
    ]);
    expect(pushCard(pushing(250, 10), [], RECORD_NOW)?.lines).toEqual([
      'A reading is its first working set each session, at 12 reps or fewer with 3 or fewer in reserve.',
    ]);
  });

  it('builds a baseline before six weeks and ten sessions, saying what is to come', () => {
    const card = pushCard(pushing(250, 22), sessions(21, 0.01), RECORD_NOW);
    expect(card?.headline).toBe('Building a baseline');
    expect(card?.lines[0]).toMatch(
      /^Building a baseline: 6 readings so far, 4 more sessions and 3 more weeks to go\.$/,
    );
    expect(card?.lines[1]).toMatch(/^Now about \d+ lb \(estimated max\)\.$/);
  });

  it('gives the pace with its band once it means something, and where it leads', () => {
    // 185 lb for 5 reps with 2 in reserve reads about 228 lb, about 247 lb eight weeks on.
    const card = pushCard(pushing(255, 57), sessions(56, 0.01), RECORD_NOW);
    expect(card?.headline).toMatch(
      /^About \+1(\.\d)?% a week \(likely \+\d+(\.\d)?% to \+\d+(\.\d)?%\)$/,
    );
    expect(
      card?.lines.some((line) => /^At this pace, around [A-Z][a-z]{2} \d+ \(likely /.test(line)),
    ).toBe(true);
    const far = pushCard(pushing(400, 57), sessions(56, 0.01), RECORD_NOW);
    expect(far?.lines).toContain(
      'At this pace, more than 12 weeks away. Gains usually slow with time and strength (Steele et al. 2023), so no date is given.',
    );
    const done = pushCard(pushing(150, 57), sessions(56, 0.01), RECORD_NOW);
    expect(done?.lines).toContain('Target reached: set a new one in Settings, or stop the push.');
  });

  it('checks a date against the pace and against what lifters gain', () => {
    const soon = pushCard(pushing(280, 57, daysAgo(-14)), sessions(56, 0.01), RECORD_NOW);
    expect(soon?.lines.some((line) => line.startsWith('Unlikely by '))).toBe(true);
    expect(soon?.lines.some((line) => line.startsWith('Ambitious: about '))).toBe(true);
    const later = pushCard(pushing(260, 57, daysAgo(-120)), sessions(56, 0.01), RECORD_NOW);
    expect(later?.lines.some((line) => line.startsWith('Within reach by '))).toBe(true);
    const passed = pushCard(pushing(280, 57, daysAgo(3)), sessions(56, 0.01), RECORD_NOW);
    expect(
      passed?.lines.some((line) => line.endsWith('has passed: set a new date in Settings.')),
    ).toBe(true);
  });
});
