import { describe, expect, it } from 'vitest';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  PAIN_HELP_LINE,
  PAIN_PATTERN_FOOTNOTE,
  PAIN_PATTERN_SOURCE,
  RATING_PAIN_SOURCE,
  conductCoach,
  emptyDeclines,
  gatherSignals,
  isDeclined,
  recordDecline,
  setAsideForWorkout,
  type CoachInput,
} from './coachConductor';

/**
 * Maintenance 27, the owner's item 45: the pain pattern's card. It names the joint, the exercise,
 * the counts and the dates, offers the four-week swap, never diagnoses, and Not now keeps it away
 * until a new report.
 */

const DAY = 86_400_000;
const BENCH = 'barbell-bench-press';
const DB_BENCH = 'dumbbell-bench-press';
const profile = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const at = (days: number) => new Date(Date.parse(RECORD_NOW) - days * DAY).toISOString();

function day(daysAgo: number, done: string, report?: Joint, rating?: Joint): WorkoutRecord {
  return {
    id: `w-${daysAgo}`,
    startedAt: at(daysAgo),
    completedAt: at(daysAgo),
    locationId: 'gym',
    templateId: 'push-arms',
    endedEarly: false,
    rating: rating
      ? { effort: 'right', pain: true, joint: rating, energyAfter: 3, note: '' }
      : null,
    skippedExerciseIds: [],
    painJoints: report ? [report] : [],
    ...(report ? { painReports: [{ exerciseId: done, joint: report }] } : {}),
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: done,
        sets: [{ kind: 'working' as const, reps: 8, weight: 100, rir: 2, completed: true }],
      },
    ],
  };
}

const history = [
  day(21, BENCH, 'shoulder'),
  day(17, DB_BENCH),
  day(14, BENCH, 'shoulder'),
  day(10, DB_BENCH),
  day(7, BENCH, 'shoulder', 'shoulder'),
];

function input(records: WorkoutRecord[], templateId = 'push-arms'): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: records,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId },
  });
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history: records,
    now: RECORD_NOW,
    fatigue: interpretFatigue(records, RECORD_NOW, null),
    strategy: [],
    lastExportAt: RECORD_NOW,
    workoutCount: records.length,
    location: gym,
    stalls: [],
  };
}

const patternOf = (coachInput: CoachInput) =>
  gatherSignals(coachInput).find((signal) => signal.source.startsWith(PAIN_PATTERN_SOURCE));

describe("the pain pattern's card", () => {
  it('names the joint, the exercise, the counts and the dates, and offers the swap', () => {
    const coach = input(history);
    const signal = patternOf(coach);
    expect(signal?.domain).toBe('safety');
    expect(signal?.headline).toBe(
      'Shoulder pain with Barbell Bench Press, not with Dumbbell Bench Press',
    );
    const day = (days: number) =>
      new Date(at(days)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(signal?.why).toEqual([
      `You noted shoulder pain in each of your last 3 sessions with Barbell Bench Press: ${day(21)}, ${day(14)}, ${day(7)}.`,
      `None in 2 sessions with Dumbbell Bench Press: ${day(17)}, ${day(10)}.`,
      'After 4 weeks Barbell Bench Press comes back at a lighter load.',
    ]);
    const bench = allEntries(coach.workout.blocks).find((entry) => entry.exerciseId === BENCH);
    expect(signal?.action).toEqual({
      kind: 'lasting-swap',
      entryId: bench?.id,
      exerciseId: DB_BENCH,
      label: 'Use Dumbbell Bench Press for 4 weeks',
    });
    expect(signal?.footnote).toBe(PAIN_PATTERN_FOOTNOTE);
    // It stands in place of the last workout's pain card on the same joint, and leads.
    expect(gatherSignals(coach).some((one) => one.source === RATING_PAIN_SOURCE)).toBe(false);
    expect(conductCoach(coach)?.signal.source).toBe(signal?.source);
  });

  it('says nothing that names a condition, a cause or a promise', () => {
    const signal = patternOf(input(history))!;
    const text = [signal.headline, ...signal.why, signal.footnote].join(' ').toLowerCase();
    for (const word of [
      /tendin/,
      /impingement/,
      /bursitis/,
      /arthritis/,
      /\bsprain/,
      /\bstrain/,
      /\btear/,
      /\binjur/,
      /\bdamage/,
      /inflammation/,
      /\bcauses?\b/,
      /\bsafe\b/,
      /\bprevent/,
      /\bheals?\b/,
      /\bwarning/,
    ]) {
      expect(text, String(word)).not.toMatch(word);
    }
  });

  it('says it is not a diagnosis, and when to see someone, at every experience level', () => {
    // A brief card (intermediate and advanced) shows two reasons; the footnote always shows.
    for (const experience of ['beginner', 'intermediate', 'advanced'] as const) {
      const coach = input(history);
      const card = conductCoach({ ...coach, profile: { ...coach.profile, experience } });
      expect(card?.signal.source.startsWith(PAIN_PATTERN_SOURCE), experience).toBe(true);
      const shown = [card?.signal.headline, ...(card?.signal.why ?? []), card?.signal.footnote];
      expect(shown.join(' '), experience).toContain(
        'A pattern in what you logged, not a diagnosis.',
      );
      expect(shown.join(' '), experience).toContain(PAIN_HELP_LINE);
    }
  });

  it('forgets the pattern after the lifter resets it (item 47)', () => {
    const reset = { ...input(history), resets: { id: 'learned-resets' as const, pain: at(8) } };
    expect(patternOf(reset)).toBeUndefined();
  });

  it('waits for a day with the exercise', () => {
    expect(patternOf(input(history, 'lower'))).toBeUndefined();
  });

  it("put away, leaves its place to the last workout's pain card for the joint", () => {
    const signal = patternOf(input(history))!;
    const declines = recordDecline(emptyDeclines(), signal, RECORD_NOW);
    // The last session's rating said shoulder pain: its card shows in the pattern's place.
    const shown = gatherSignals({ ...input(history), declines });
    expect(shown.some((one) => one.source === RATING_PAIN_SOURCE)).toBe(true);
  });

  it('keeps away after Not now until a new report, and only then', () => {
    const signal = patternOf(input(history))!;
    expect(setAsideForWorkout(signal)).toBe(false);
    const declines = recordDecline(emptyDeclines(), signal, RECORD_NOW);
    // A week on, with nothing new, it stays away.
    expect(
      isDeclined(declines, signal, new Date(Date.parse(RECORD_NOW) + 30 * DAY).toISOString()),
    ).toBe(true);
    // A new report on the bench press brings it back.
    const newer = patternOf(input([...history, day(2, BENCH, 'shoulder')]))!;
    expect(newer.source).not.toBe(signal.source);
    expect(isDeclined(declines, newer, RECORD_NOW)).toBe(false);
  });
});
