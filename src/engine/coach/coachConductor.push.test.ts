import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  addsToPushedMuscles,
  gatherSignals,
  pushSource,
  type CoachInput,
  type CoachSignal,
} from './coachConductor';

/**
 * Maintenance 27, the owner's item 44: while a lift is pushed, the other work for its muscles
 * holds (no offer adds to it), and the coach offers to end the push when it stalls or falls, and a
 * review every twelve weeks.
 */

const NOW = RECORD_NOW;
const DAY = 86_400_000;
const base = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const BENCH = 'barbell-bench-press';
const pushing = (since: string, exerciseId = BENCH): UserProfile => ({
  ...base,
  pushLift: { exerciseId, target: 250, units: 'lb', since },
});
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * DAY).toISOString();

function input(profile: UserProfile, history: WorkoutRecord[] = []): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
  });
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: NOW,
    fatigue: interpretFatigue(history, NOW, null),
    strategy: [],
    lastExportAt: NOW,
    workoutCount: history.length,
    location: gym,
    stalls: [],
  };
}

const offer = (trigger: object): CoachSignal => ({
  domain: 'progression',
  headline: 'More',
  why: [],
  action: { kind: 'recalibrate', trigger: trigger as never, label: 'Do it' },
  confidence: 'medium',
  severity: 1,
  source: 'test',
});

describe('the other work for its muscles holds', () => {
  const coach = input(pushing(daysAgo(10)));
  const entryFor = (muscle: string) =>
    allEntries(coach.workout.blocks).find((entry) =>
      requireExercise(entry.exerciseId).primaryMuscles.includes(muscle as never),
    );

  it('holds an added set, a drop set, or more sets at fewer reps on a lift for its muscles', () => {
    const chest = entryFor('chest');
    expect(chest).toBeDefined();
    for (const trigger of [
      { type: 'sets', entryId: chest!.id, workingDelta: 1 },
      { type: 'drop-set', entryId: chest!.id, on: true },
      { type: 'rep-range', entryId: chest!.id, reps: [4, 6], workingDelta: 1 },
      { type: 'add-exercise', exerciseId: 'cable-fly', muscle: 'chest', sets: 2 },
    ]) {
      expect(addsToPushedMuscles(coach, offer(trigger)), JSON.stringify(trigger)).toBe(true);
    }
  });

  it('lets a set come off, other muscles gain, and everything through without a push', () => {
    const chest = entryFor('chest')!;
    const other = allEntries(coach.workout.blocks).find(
      (entry) =>
        !requireExercise(entry.exerciseId).primaryMuscles.some((muscle) =>
          requireExercise(BENCH).primaryMuscles.includes(muscle),
        ),
    );
    expect(other).toBeDefined();
    expect(
      addsToPushedMuscles(coach, offer({ type: 'sets', entryId: chest.id, workingDelta: -1 })),
    ).toBe(false);
    expect(
      addsToPushedMuscles(coach, offer({ type: 'sets', entryId: other!.id, workingDelta: 1 })),
    ).toBe(false);
    expect(
      addsToPushedMuscles(input(base), offer({ type: 'sets', entryId: chest.id, workingDelta: 1 })),
    ).toBe(false);
  });

  it('holds the extra set the progression offers on a lift for its muscles', () => {
    const plain = input(base);
    const chest = allEntries(plain.workout.blocks).find((entry) =>
      requireExercise(entry.exerciseId).primaryMuscles.includes('chest'),
    );
    expect(chest).toBeDefined();
    // Two sessions at the top of the range on the chest lift: an extra set is on offer.
    const advised = (coachInput: CoachInput): CoachInput => ({
      ...coachInput,
      workout: {
        ...coachInput.workout,
        blocks: coachInput.workout.blocks.map((block) => ({
          ...block,
          entries: block.entries.map((entry) =>
            entry.id === chest!.id
              ? {
                  ...entry,
                  progression: {
                    mode: 'reps' as const,
                    evidence: [
                      'Two sessions at the top of the range: an extra set is on the table.',
                    ],
                    sessions: 3,
                    viaFamily: false,
                    confidence: 'high' as const,
                    setsAdvice: 1 as const,
                  },
                }
              : entry,
          ),
        })),
      },
    });
    const extraSet = (coachInput: CoachInput) =>
      gatherSignals(coachInput).some((signal) => signal.source === 'extra set');
    expect(extraSet(advised(plain))).toBe(true);
    expect(extraSet(advised({ ...plain, profile: pushing(daysAgo(10)) }))).toBe(false);
  });
});

describe("the push's own offers", () => {
  /** Sessions of the lift every three days from `days` ago to `until`, its max moving `weekly`. */
  function sessions(days: number, weekly: number, short = false, until = 1): WorkoutRecord[] {
    const out: WorkoutRecord[] = [];
    for (let day = days; day >= until; day -= 3) {
      const weight = Math.round(185 * (1 + weekly) ** ((days - day) / 7));
      out.push(record(day, BENCH, [[short ? 2 : 5, weight, short ? 0 : 2]], [4, 6], 2));
    }
    return out;
  }

  it('offers to end it when the lift fell well short two sessions running', () => {
    const history = [...sessions(30, 0.01, false, 8), ...sessions(5, 0, true, 2)];
    const signal = gatherSignals(input(pushing(daysAgo(31)), history)).find((one) =>
      one.source.startsWith('push: stop'),
    );
    expect(signal?.domain).toBe('recovery');
    expect(signal?.headline).toBe('Barbell Bench Press fell short two sessions running');
    expect(signal?.action).toEqual({ kind: 'end-push', label: 'End the push' });
    expect(signal?.exerciseId).toBe(BENCH);
  });

  it('reads only sessions since the push began, and each reason to end it is its own', () => {
    // Two short sessions just before the push began: nothing to say of the push.
    const before = sessions(5, 0, true, 2);
    const fresh = gatherSignals(input(pushing(daysAgo(1)), before)).find((one) =>
      one.source.startsWith('push: stop'),
    );
    expect(fresh).toBeUndefined();
    // Falling short and a flat pace each have their own Not now.
    const short = gatherSignals(
      input(pushing(daysAgo(31)), [...sessions(30, 0.01, false, 8), ...sessions(5, 0, true, 2)]),
    ).find((one) => one.source.startsWith('push: stop'))!;
    const flat = gatherSignals(input(pushing(daysAgo(57)), sessions(56, -0.01))).find((one) =>
      one.source.startsWith('push: stop'),
    )!;
    expect(short.source).toBe(pushSource('short', daysAgo(31), daysAgo(2)));
    expect(flat.source).toBe(pushSource('flat', daysAgo(57)));
  });

  it('offers to end it when its pace is flat after six weeks, and not before', () => {
    const falling = sessions(56, -0.01);
    const late = gatherSignals(input(pushing(daysAgo(57)), falling)).find((one) =>
      one.source.startsWith('push: stop'),
    );
    expect(late?.domain).toBe('plateau');
    expect(late?.headline).toBe('Barbell Bench Press has stopped climbing');
    const early = gatherSignals(input(pushing(daysAgo(30)), sessions(30, -0.01))).find((one) =>
      one.source.startsWith('push: stop'),
    );
    expect(early).toBeUndefined();
    const climbing = gatherSignals(input(pushing(daysAgo(57)), sessions(56, 0.01))).find((one) =>
      one.source.startsWith('push: stop'),
    );
    expect(climbing).toBeUndefined();
  });

  it('offers a review at twelve weeks, once a block, and none before', () => {
    const since = daysAgo(12 * 7 + 1);
    const review = gatherSignals(input(pushing(since), sessions(84, 0.005))).find((one) =>
      one.source.startsWith('push: review'),
    );
    expect(review?.headline).toBe('12 weeks of pushing Barbell Bench Press');
    // Two lines, so a brief card (two reasons) still says what ending the push does.
    expect(review?.why).toHaveLength(2);
    expect(review?.why[1]).toBe(
      'Keep it, change the target in Settings, or end it: ending takes away its extra session, and the lift keeps its own place.',
    );
    expect(review?.source).toBe(pushSource('review', since, 1));
    expect(review?.action?.kind).toBe('end-push');
    const before = gatherSignals(input(pushing(daysAgo(80)), sessions(79, 0.005))).find((one) =>
      one.source.startsWith('push: review'),
    );
    expect(before).toBeUndefined();
  });

  it('says at the review what a pace still needs, not that the readings scatter', () => {
    // Six sessions in twelve weeks: four readings short of a pace.
    const sparse = [84, 70, 56, 42, 28, 14].map((day) =>
      record(day, BENCH, [[5, 185 + (84 - day) / 7, 2]], [4, 6], 2),
    );
    const review = gatherSignals(input(pushing(daysAgo(85)), sparse)).find((one) =>
      one.source.startsWith('push: review'),
    );
    expect(review?.why[0]).toMatch(/^Its pace needs 4 more readings of its first working set\. /);
  });

  it('says at the review what a reading is when none came', () => {
    // Light weights: twelve weeks at 15 reps, past what a reading reads (the re-check of item 44).
    const light = [84, 70, 56, 42, 28, 14].map((day) =>
      record(day, BENCH, [[15, 95, 1]], [10, 15], 1),
    );
    const review = gatherSignals(input(pushing(daysAgo(85)), light)).find((one) =>
      one.source.startsWith('push: review'),
    );
    expect(review?.why[0]).toMatch(
      /^No reading of it yet: the pace reads its first working set each session, at 12 reps or fewer with 3 or fewer in reserve\. /,
    );
  });
});
