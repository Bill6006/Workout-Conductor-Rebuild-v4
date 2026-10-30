import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import type { StallDiagnosis } from '../strategy/plateau';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  VARIETY_SOURCE,
  emptyDeclines,
  gatherSignals,
  isDeclined,
  recordDecline,
  type CoachInput,
} from './coachConductor';

/**
 * Maintenance 27, the owner's item 49, in the coach: a stalled accessory's variation step names one
 * alternative for four weeks; a main lift keeps the sheet of variations; an accessory flat for eight
 * weeks after twelve in the plan gets one offer, never in a deload week.
 */

const DAY = 86_400_000;
const profile = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const at = (days: number) => new Date(Date.parse(RECORD_NOW) - days * DAY).toISOString();

function input(history: WorkoutRecord[], extra: Partial<CoachInput> = {}): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: RECORD_NOW,
    fatigue: interpretFatigue(history, RECORD_NOW),
    strategy: [],
    lastExportAt: RECORD_NOW,
    workoutCount: history.length,
    location: gym,
    stalls: [],
    ...extra,
  };
}

function stall(exerciseId: string): StallDiagnosis {
  return {
    exerciseId,
    kind: 'stalled-at-effort',
    exposures: 4,
    totalExposures: 5,
    baselineE1rm: 100,
    latestE1rm: 100,
    effortMet: 4,
    effortUnknown: 0,
    firstDate: RECORD_NOW,
    lastDate: RECORD_NOW,
    why: ['No better estimated max in four exposures at the prescribed effort.'],
  };
}

const atVariation = (exerciseId: string) => ({
  id: 'coach-routes' as const,
  routes: {
    [exerciseId]: {
      exerciseId,
      step: 1,
      startedAt: RECORD_NOW,
      baselineE1rm: 100,
      applied: [{ step: 0, at: at(14) }],
      exhausted: false,
    },
  },
});

/** Weekly sessions of one exercise, the newest `newest` days ago, `weeks` in all. */
function weekly(exerciseId: string, weeks: number, newest = 3): WorkoutRecord[] {
  return Array.from({ length: weeks }, (_, index) => {
    const days = newest + 7 * index;
    return {
      id: `w-${exerciseId}-${days}`,
      startedAt: at(days),
      completedAt: at(days),
      locationId: 'gym',
      templateId: 'push-arms',
      endedEarly: false,
      rating: null,
      skippedExerciseIds: [],
      painJoints: [],
      readiness: null,
      prs: [],
      entries: [
        {
          exerciseId,
          sets: [{ kind: 'working' as const, reps: 12, weight: 40, rir: 2, completed: true }],
        },
      ],
    };
  });
}

/** The push day's first accessory, and a stall route at its variation step after weeks on it. */
function stalledAccessory(history: (exerciseId: string) => WorkoutRecord[], extra = {}) {
  const exerciseId = allEntries(input([]).workout.blocks).find(
    (entry) => !requireExercise(entry.exerciseId).compound,
  )!.exerciseId;
  const coach = input(history(exerciseId), {
    stalls: [stall(exerciseId)],
    routes: atVariation(exerciseId),
    ...extra,
  });
  const signal = gatherSignals(coach).find(
    (one) => one.domain === 'plateau' && one.exerciseId === exerciseId,
  );
  return { exerciseId, coach, signal };
}

describe("a stall route's variation step", () => {
  it('names one alternative for an accessory, for four weeks', () => {
    // Six weeks on the accessory: in the plan long enough to change.
    const { exerciseId, coach, signal } = stalledAccessory((id) => weekly(id, 6));
    const accessory = allEntries(coach.workout.blocks).find(
      (entry) => entry.exerciseId === exerciseId,
    )!;
    expect(signal?.action?.kind).toBe('lasting-swap');
    if (signal?.action?.kind !== 'lasting-swap') return;
    expect(signal.action.entryId).toBe(accessory.id);
    expect(signal.action.label).toMatch(/^Use .+ for 4 weeks$/);
    expect(signal.action.route).toMatchObject({ exerciseId: accessory.exerciseId, step: 1 });
    expect(requireExercise(signal.action.exerciseId).compound).toBe(false);
  });

  it('keeps the sheet of variations for an accessory changed in the last four weeks', () => {
    // Two weeks on it: too new to change for four weeks (the review of item 49).
    const { signal } = stalledAccessory((id) => weekly(id, 2));
    expect(signal?.action).toMatchObject({ kind: 'alternatives', label: 'Swap for a variation' });
  });

  it('keeps the sheet of variations for an accessory with a pain pattern', () => {
    // Skull crushers hurt the elbow, the pushdown does not: the pattern's own card and swap first.
    const reported = (days: number, exerciseId: string, hurt: boolean): WorkoutRecord => ({
      ...weekly(exerciseId, 1, days)[0]!,
      ...(hurt
        ? { painJoints: ['elbow' as const], painReports: [{ exerciseId, joint: 'elbow' as const }] }
        : {}),
    });
    const history = [
      ...weekly('skull-crusher', 2, 28),
      reported(21, 'skull-crusher', true),
      reported(17, 'cable-triceps-pushdown', false),
      reported(14, 'skull-crusher', true),
      reported(10, 'cable-triceps-pushdown', false),
      reported(7, 'skull-crusher', true),
    ];
    const base = input(history, {
      stalls: [stall('skull-crusher')],
      routes: atVariation('skull-crusher'),
    });
    // Today's elbow lift is the skull crusher.
    const workout = {
      ...base.workout,
      blocks: base.workout.blocks.map((block) => ({
        ...block,
        entries: block.entries.map((entry) =>
          entry.exerciseId === 'cable-triceps-pushdown'
            ? { ...entry, exerciseId: 'skull-crusher' }
            : entry,
        ),
      })),
    };
    const signal = gatherSignals({ ...base, workout }).find(
      (one) => one.domain === 'plateau' && one.exerciseId === 'skull-crusher',
    );
    expect(signal?.action).toMatchObject({ kind: 'alternatives', label: 'Swap for a variation' });
  });

  it('never names an exercise the lifter avoids today', () => {
    const { signal } = stalledAccessory((id) => weekly(id, 6));
    if (signal?.action?.kind !== 'lasting-swap') throw new Error('no four-week offer');
    const named = signal.action.exerciseId;
    const { signal: avoiding } = stalledAccessory((id) => weekly(id, 6), {
      constraints: { ...emptyConstraints(), avoidExerciseIds: [named] },
    });
    const action = avoiding?.action;
    expect(action?.kind === 'lasting-swap' ? action.exerciseId : null).not.toBe(named);
  });

  it('keeps the sheet of variations for a main lift', () => {
    const coach = input([], {
      stalls: [stall('barbell-bench-press')],
      routes: atVariation('barbell-bench-press'),
    });
    const signal = gatherSignals(coach).find(
      (one) => one.domain === 'plateau' && one.exerciseId === 'barbell-bench-press',
    );
    expect(signal?.action).toMatchObject({ kind: 'alternatives', label: 'Swap for a variation' });
  });
});

describe('an accessory gone flat', () => {
  /** Weekly sessions of the push day's accessories for fourteen weeks, every one the same. */
  function flatHistory(): WorkoutRecord[] {
    const day = input([]);
    const accessories = allEntries(day.workout.blocks)
      .map((entry) => entry.exerciseId)
      .filter((id) => !requireExercise(id).compound);
    return Array.from({ length: 14 }, (_, index) => {
      // The newest three days ago: yesterday's accessories would give way today.
      const days = 3 + 7 * index;
      return {
        id: `w-${days}`,
        startedAt: at(days),
        completedAt: at(days),
        locationId: 'gym',
        templateId: 'push-arms',
        endedEarly: false,
        rating: null,
        skippedExerciseIds: [],
        painJoints: [],
        readiness: null,
        prs: [],
        entries: accessories.map((exerciseId) => ({
          exerciseId,
          sets: [{ kind: 'working' as const, reps: 12, weight: 40, rir: 2, completed: true }],
        })),
      };
    });
  }

  it('gets one offer of a named alternative for four weeks', () => {
    const signals = gatherSignals(input(flatHistory())).filter(
      (one) => one.source === VARIETY_SOURCE,
    );
    expect(signals).toHaveLength(1);
    const [signal] = signals;
    expect(signal?.headline).toMatch(/: no higher in eight weeks$/);
    expect(signal?.action?.kind).toBe('lasting-swap');
    expect(signal?.why[1]).toContain('(Kassiano et al. 2022)');
  });

  it('leaves its place to the next accessory gone flat when put away', () => {
    const history = flatHistory();
    const first = gatherSignals(input(history)).find((one) => one.source === VARIETY_SOURCE)!;
    const declines = recordDecline(emptyDeclines(), first, RECORD_NOW);
    const shown = gatherSignals(input(history, { declines })).filter(
      (one) => one.source === VARIETY_SOURCE && !isDeclined(declines, one, RECORD_NOW),
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]!.exerciseId).not.toBe(first.exerciseId);
  });

  it('gets none for a lift whose stall route is still open', () => {
    const history = flatHistory();
    const flat = gatherSignals(input(history)).find((one) => one.source === VARIETY_SOURCE)!;
    const routed = gatherSignals(input(history, { routes: atVariation(flat.exerciseId!) })).filter(
      (one) => one.source === VARIETY_SOURCE,
    );
    expect(routed.every((one) => one.exerciseId !== flat.exerciseId)).toBe(true);
  });

  it('gets none in a deload week, and none for a lift on a stall route', () => {
    const history = flatHistory();
    const deload = { startsAt: RECORD_NOW, endsAt: at(-7) };
    expect(
      gatherSignals(input(history, { constraints: { ...emptyConstraints(), deload } })).some(
        (one) => one.source === VARIETY_SOURCE,
      ),
    ).toBe(false);
    const flat = gatherSignals(input(history)).find((one) => one.source === VARIETY_SOURCE)!;
    const stalled = gatherSignals(input(history, { stalls: [stall(flat.exerciseId!)] })).filter(
      (one) => one.source === VARIETY_SOURCE,
    );
    expect(stalled.every((one) => one.exerciseId !== flat.exerciseId)).toBe(true);
  });
});
