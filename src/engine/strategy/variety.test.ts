import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { buildConflictContext } from '../conflicts/context';
import { sessionConflictContext } from '../workoutGenerator/generate';
import { changedRecently, goneFlat, isAccessory, varietyFor } from './variety';

/**
 * Maintenance 27, the owner's item 49: variety for accessories where it helps. One alternative for
 * the same movement, at least as good for growth, never a main lift; an accessory flat for eight
 * weeks after twelve in the plan; nothing within four weeks of a change.
 */

const DAY = 86_400_000;
const profile = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const context = buildConflictContext(profile, gym);
const at = (days: number) => new Date(Date.parse(RECORD_NOW) - days * DAY).toISOString();

function session(
  days: number,
  exerciseId: string,
  weight: number,
  replacedFrom?: string,
): WorkoutRecord {
  return {
    id: `w-${days}-${exerciseId}`,
    startedAt: at(days),
    completedAt: at(days),
    locationId: 'gym',
    templateId: 'pull-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId,
        ...(replacedFrom ? { replacedFrom } : {}),
        sets: [{ kind: 'working' as const, reps: 10, weight, rir: 2, completed: true }],
      },
    ],
  };
}

const CURL = requireExercise('ez-bar-curl');

describe('the alternative a variety offer names', () => {
  it('is another single-joint lift for the same movement, at least as good for growth', () => {
    const other = varietyFor({ exercise: CURL, history: [], now: RECORD_NOW, context });
    expect(other).not.toBeNull();
    expect(other!.movementPattern).toBe(CURL.movementPattern);
    expect(isAccessory(other!)).toBe(true);
    expect(other!.hypertrophySuitability).toBeGreaterThanOrEqual(CURL.hypertrophySuitability);
    expect(other!.id).not.toBe(CURL.id);
  });

  it('is never for a main lift', () => {
    // The band pulldown shares its movement with two single-joint lifts rated as high for growth:
    // only the rule keeps them away.
    for (const id of ['barbell-bench-press', 'band-lat-pulldown']) {
      expect(
        varietyFor({ exercise: requireExercise(id), history: [], now: RECORD_NOW, context }),
        id,
      ).toBeNull();
    }
  });

  it('is never one less suited to growth', () => {
    // The lateral raise's one other choice rated as high is already in today's plan; the band
    // raise rates lower, so there is no offer.
    const raise = requireExercise('lateral-raise');
    expect(requireExercise('band-lateral-raise').hypertrophySuitability).toBeLessThan(
      raise.hypertrophySuitability,
    );
    expect(
      varietyFor({
        exercise: raise,
        history: [],
        now: RECORD_NOW,
        context,
        today: ['cable-lateral-raise'],
      }),
    ).toBeNull();
  });

  it('leaves out one left in the last twelve weeks, and one already in today', () => {
    const first = varietyFor({ exercise: CURL, history: [], now: RECORD_NOW, context })!;
    // The lifter swapped the first choice out for the curl five weeks ago.
    const left = varietyFor({
      exercise: CURL,
      history: [session(35, CURL.id, 60, first.id)],
      now: RECORD_NOW,
      context,
    });
    expect(left?.id).not.toBe(first.id);
    const today = varietyFor({
      exercise: CURL,
      history: [],
      now: RECORD_NOW,
      context,
      today: [first.id],
    });
    expect(today?.id).not.toBe(first.id);
  });

  it('never puts more stress on a joint flagged or protected today than the lift it stands in for', () => {
    const rank = (id: string, joint: string) =>
      ({ low: 0, moderate: 1, high: 2 })[
        (requireExercise(id).jointStress as Record<string, 'low' | 'moderate' | 'high'>)[joint] ??
          'low'
      ];
    // The pushdown with the elbow protected today: the overhead extension (moderate) would be next.
    const plain = varietyFor({
      exercise: requireExercise('cable-triceps-pushdown'),
      history: [],
      now: RECORD_NOW,
      context,
    })!;
    expect(rank(plain.id, 'elbow')).toBeGreaterThan(rank('cable-triceps-pushdown', 'elbow'));
    for (const [id, joint] of [
      ['cable-triceps-pushdown', 'elbow'],
      ['dead-bug', 'lower-back'],
      ['straight-arm-pulldown', 'shoulder'],
    ] as const) {
      const other = varietyFor({
        exercise: requireExercise(id),
        history: [],
        now: RECORD_NOW,
        context: sessionConflictContext(profile, gym, { painJoints: [joint] }),
      });
      expect(other === null || rank(other.id, joint) <= rank(id, joint), id).toBe(true);
    }
  });

  it('leaves out one the lifter dislikes', () => {
    const first = varietyFor({ exercise: CURL, history: [], now: RECORD_NOW, context })!;
    const disliked = buildConflictContext(
      { ...profile, exercisePreferences: { preferred: [], disliked: [first.name] } },
      gym,
    );
    expect(
      varietyFor({ exercise: CURL, history: [], now: RECORD_NOW, context: disliked })?.id,
    ).not.toBe(first.id);
  });
});

describe('an accessory gone flat', () => {
  /** Weekly sessions for `weeks`, the newest yesterday, the weight from `weightAt(daysAgo)`. */
  const weekly = (weeks: number, weightAt: (days: number) => number) =>
    Array.from({ length: weeks }, (_, index) => {
      const days = 1 + 7 * index;
      return session(days, CURL.id, weightAt(days));
    });

  it('is twelve weeks or more in the plan and no higher than eight weeks before', () => {
    const flat = goneFlat(
      weekly(14, () => 60),
      CURL.id,
      RECORD_NOW,
    );
    expect(flat).not.toBeNull();
    expect(flat!.now).toBe(flat!.before);
  });

  it('is not a lift climbing through a deload week, nor one back from a break', () => {
    // A pound a week, its last week a deload at 90%: the week before still shows the climb.
    const deloaded = weekly(14, (days) => (days === 1 ? 0.9 : 1) * (100 - days / 7));
    expect(goneFlat(deloaded, CURL.id, RECORD_NOW)).toBeNull();
    // Back after seven weeks away at 85% of before: new again, and not flat.
    const before = Array.from({ length: 10 }, (_, index) => session(60 + 7 * index, CURL.id, 60));
    const back = [...before, session(8, CURL.id, 51), session(1, CURL.id, 51)];
    expect(goneFlat(back, CURL.id, RECORD_NOW)).toBeNull();
    expect(changedRecently(back, CURL.id, [], RECORD_NOW)).toBe(true);
  });

  it('is not while it climbs, nor before twelve weeks', () => {
    expect(
      goneFlat(
        weekly(14, (days) => 70 - days / 7),
        CURL.id,
        RECORD_NOW,
      ),
    ).toBeNull();
    expect(
      goneFlat(
        weekly(10, () => 60),
        CURL.id,
        RECORD_NOW,
      ),
    ).toBeNull();
  });
});

describe('a recent change', () => {
  it('is a lift new in the last four weeks, or swapped in or out in them', () => {
    expect(changedRecently([session(20, CURL.id, 60)], CURL.id, [], RECORD_NOW)).toBe(true);
    expect(changedRecently([session(40, CURL.id, 60)], CURL.id, [], RECORD_NOW)).toBe(false);
    expect(
      changedRecently(
        [session(40, CURL.id, 60)],
        CURL.id,
        [{ from: 'dumbbell-curl', to: CURL.id, until: at(-14), setAt: at(14) }],
        RECORD_NOW,
      ),
    ).toBe(true);
  });
});
