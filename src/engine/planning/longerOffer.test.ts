import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultProfile } from '../../core/validation/profile';
import type { GeneratedWorkout, WorkoutEntry } from '../workout/types';
import { longerOffer, nextLonger, priorityMuscles, setsIn } from './longerOffer';
import type { WeekModel } from './weekModel';

/**
 * Maintenance 34, "Longer would help": the next length up, and the muscles the goals weight up whose
 * week it closes at least half of, from the plan the tap would build. Synthetic data only.
 */

const NOW = '2026-09-10T12:00:00.000Z';
// The default profile: build muscle, bigger arms second, a 60-minute Default.
const profile = createDefaultProfile(NOW);

/** A plan of curls: `sets` working sets of an EZ-bar curl, the biceps' own lift. */
const curls = (sets: number): Pick<GeneratedWorkout, 'blocks'> => ({
  blocks: [
    {
      id: 'b1',
      kind: 'straight',
      label: 'A',
      rounds: sets,
      restBetweenRoundsSeconds: 60,
      entries: [
        {
          id: 'e1',
          exerciseId: 'ez-bar-curl',
          sets: Array.from({ length: sets }, (_, index) => ({ index, kind: 'working' })),
        } as unknown as WorkoutEntry,
      ],
    },
  ],
});

/**
 * A week where every muscle has its target met except the biceps, `done` sets in and none ahead
 * (or `ahead`, today's own plan among them), and the triceps where `triceps` says what they did.
 */
function weekFor(
  done: number,
  ahead: { planned: number; plannedToday: number } = { planned: 0, plannedToday: 0 },
  triceps?: number,
): WeekModel {
  const muscles = Object.fromEntries(
    MUSCLE_IDS.map((muscle) => [
      muscle,
      {
        done:
          muscle === 'biceps' ? done : muscle === 'triceps' && triceps !== undefined ? triceps : 20,
        today: 0,
        todayDirect: 0,
        planned: muscle === 'biceps' ? ahead.planned : 0,
        plannedToday: muscle === 'biceps' ? ahead.plannedToday : 0,
        target: muscle === 'biceps' || muscle === 'triceps' ? 13 : 10,
        daysSince: null,
        daysBefore: null,
      },
    ]),
  ) as WeekModel['muscles'];
  return { week: '2026-09-07', sessionsAhead: 1, trainedToday: false, muscles };
}

/** A plan of curls and pushdowns, each lift's working sets. */
const armsDay = (curl: number, pushdown: number): Pick<GeneratedWorkout, 'blocks'> => ({
  blocks: [
    ...curls(curl).blocks,
    {
      id: 'b2',
      kind: 'straight',
      label: 'B',
      rounds: pushdown,
      restBetweenRoundsSeconds: 60,
      entries: [
        {
          id: 'e2',
          exerciseId: 'cable-triceps-pushdown',
          sets: Array.from({ length: pushdown }, (_, index) => ({ index, kind: 'working' })),
        } as unknown as WorkoutEntry,
      ],
    },
  ],
});

const offerFor = (
  plan: number,
  trial: number,
  extra: Partial<Parameters<typeof longerOffer>[0]> = {},
) =>
  longerOffer({
    profile,
    week: weekFor(5),
    now: NOW,
    plan: curls(plan),
    next: 45,
    trial: curls(trial),
    recovering: () => false,
    skipped: new Set<MuscleId>(),
    ...extra,
  });

describe('the next length up', () => {
  it('goes up by minutes, the Default where its minutes fall', () => {
    expect(nextLonger(15, 60)).toBe(30);
    expect(nextLonger(30, 60)).toBe(45);
    expect(nextLonger(45, 60)).toBe('default');
    expect(nextLonger('default', 60)).toBeNull();
    // A Default of 40 minutes comes before 45.
    expect(nextLonger(30, 40)).toBe('default');
    expect(nextLonger('default', 40)).toBe(45);
  });
});

describe('the muscles the goals weight up', () => {
  it('are a goal’s own, never the small muscles', () => {
    expect(priorityMuscles(profile).sort()).toEqual(['biceps', 'triceps']);
  });
});

describe('the suggestion', () => {
  // The biceps: 13 a week, 5 done, nothing ahead: today owes them 8.
  it('names the next length where it closes most of the gap', () => {
    // 2 sets today leave 6 short; 6 at 45 leave 2: it closes 4 of 6.
    const offer = offerFor(2, 6);
    expect(offer).toMatchObject({ choice: 45, minutes: 45, muscles: ['biceps'], closesAll: false });
    expect(offer?.week).toBe('2026-09-07');
  });

  it('says it closes the gap whole where it does', () => {
    expect(offerFor(2, 8)?.closesAll).toBe(true);
  });

  it('says nothing where the next length closes under half', () => {
    // 2 leave 6 short; 4 leave 4: 2 of 6.
    expect(offerFor(2, 4)).toBeNull();
  });

  it('says nothing with no gap, a muscle recovering, one skipped this week, or no length above', () => {
    expect(offerFor(8, 10)).toBeNull();
    expect(offerFor(2, 8, { recovering: (muscle) => muscle === 'biceps' })).toBeNull();
    expect(offerFor(2, 8, { skipped: new Set<MuscleId>(['biceps']) })).toBeNull();
    expect(offerFor(2, 8, { next: null })).toBeNull();
  });

  it('reads the gap without today’s own plan, which the week counts among the sessions ahead', () => {
    // Today's 2 sets are in the week's planned sets: the gap is 13 - 5 - 2 = 6, and 6 at 45 leave 2.
    const offer = offerFor(2, 6, { week: weekFor(5, { planned: 2, plannedToday: 2 }) });
    expect(offer).toMatchObject({ muscles: ['biceps'], closesAll: false });
  });

  it('says nothing for a gap under a set', () => {
    // 10.5 done and 2 today: half a set short.
    expect(offerFor(2, 6, { week: weekFor(10.5) })).toBeNull();
  });

  it('names the muscle furthest behind first', () => {
    // The biceps 6 short with today's 2 curls; the triceps, none done, 13 short.
    const offer = offerFor(2, 6, {
      week: weekFor(5, undefined, 0),
      plan: armsDay(2, 0),
      trial: armsDay(8, 10),
    });
    expect(offer?.muscles).toEqual(['triceps', 'biceps']);
  });

  it('counts a synergist at half, as the week does', () => {
    expect(setsIn(curls(3), 'biceps')).toBe(3);
    expect(setsIn(curls(3), 'forearms')).toBeCloseTo(1.5, 6);
  });
});
