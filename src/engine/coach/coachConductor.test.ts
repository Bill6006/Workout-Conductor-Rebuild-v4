import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { CompletedSet, CompletedWork } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { currentPosition } from '../workout/sequence';
import { allEntries, type WorkoutBlock } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { DOMAIN_PRIORITY, conductCoach, gatherSignals, type CoachInput } from './coachConductor';
import { coachingPolicy } from './experience';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function input(history: WorkoutRecord[] = [], overrides: Partial<CoachInput> = {}): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
  });
  const fatigue = interpretFatigue(history, NOW, overrides.constraints?.readiness ?? null);
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
    ...overrides,
  };
}

function logged(
  workout: CoachInput['workout'],
  entryId: string,
  values: [reps: number, rir: number][],
): CompletedWork {
  const entry = allEntries(workout.blocks).find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error(entryId);
  const working = entry.sets.filter((set) => set.kind === 'working');
  const sets: CompletedSet[] = values.map(([reps, rir], index) => ({
    entryId,
    exerciseId: entry.exerciseId,
    setIndex: (working[index] as (typeof working)[number]).index,
    kind: 'working',
    reps,
    weight: 185,
    rir,
    completedAt: NOW,
  }));
  return { startedAt: NOW, elapsedSeconds: 600, currentEntryId: entryId, sets };
}

describe('coach conductor', () => {
  it('keeps the fixed priority order and returns one card with at most one action', () => {
    expect(DOMAIN_PRIORITY[0]).toBe('safety');
    expect(DOMAIN_PRIORITY.indexOf('recovery')).toBeLessThan(DOMAIN_PRIORITY.indexOf('plateau'));
    expect(DOMAIN_PRIORITY.indexOf('coverage')).toBeGreaterThan(DOMAIN_PRIORITY.indexOf('fit'));
    const card = conductCoach(input([], { workoutCount: 0 }));
    if (card) {
      expect(card.signal.why.length).toBeGreaterThan(0);
      expect(card.signal.action === null || typeof card.signal.action.label === 'string').toBe(
        true,
      );
    }
  });

  it('lets a safety signal beat a plateau, and a plateau beat a tip', () => {
    const history = [
      record(2, 'barbell-bench-press', [
        [6, 185, 2],
        [6, 185, 2],
        [6, 185, 1],
      ]),
      record(5, 'barbell-bench-press', [
        [6, 185, 2],
        [6, 185, 2],
        [6, 185, 2],
      ]),
      record(8, 'barbell-bench-press', [
        [6, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
    ];
    // The load nudge is obvious past beginner level; a beginner still gets it as a plateau card.
    const beginner = { policy: coachingPolicy('beginner') };
    const plateau = conductCoach(input(history, beginner));
    expect(plateau?.signal.domain).toBe('plateau');
    expect(plateau?.signal.headline).toBe('Barbell Bench Press is ready for more load');
    const loadedJoint = allEntries(plateau ? input(history).workout.blocks : []).flatMap((entry) =>
      Object.entries(requireExercise(entry.exerciseId).jointStress)
        .filter(([, level]) => level !== 'low')
        .map(([joint]) => joint as Joint),
    )[0] as Joint;
    const withPain = conductCoach(
      input(history, { constraints: { ...emptyConstraints(), painJoints: [loadedJoint] } }),
    );
    expect(withPain?.signal.domain).toBe('safety');
    expect(withPain?.signal.action?.kind).toBe('alternatives');
    expect(withPain?.considered).toBeGreaterThan(1);
  });

  it('asks for a backup before anything below it and puts recovery ahead of plateaus', () => {
    const history = [
      record(1, 'barbell-bench-press', [
        [5, 185, 0],
        [4, 185, 0],
        [4, 185, 0],
      ]),
      record(
        2,
        'cable-fly',
        [
          [12, 40, 0],
          [11, 40, 0],
        ],
        [10, 15],
        1,
      ),
      record(
        3,
        'lat-pulldown',
        [
          [10, 120, 0],
          [9, 120, 0],
        ],
        [8, 12],
        1,
      ),
      record(
        4,
        'back-squat',
        [
          [5, 225, 0],
          [4, 225, 0],
        ],
        [4, 6],
        2,
      ),
    ];
    const noBackup = conductCoach(input(history, { lastExportAt: null, workoutCount: 4 }));
    expect(noBackup?.signal.domain).toBe('save');
    expect(noBackup?.signal.action?.kind).toBe('backup');
    const backedUp = conductCoach(input(history, { workoutCount: 4 }));
    expect(['recovery', 'plateau']).toContain(backedUp?.signal.domain);
    const tired = interpretFatigue(history, NOW, {
      energy: 1,
      soreness: 5,
      sleep: 1,
      motivation: 2,
      jointDiscomfort: [],
      timePressure: false,
    });
    const exhausted = conductCoach(
      input(history, {
        workoutCount: 4,
        fatigue: tired,
        constraints: {
          ...emptyConstraints(),
          readiness: {
            energy: 1,
            soreness: 5,
            sleep: 1,
            motivation: 2,
            jointDiscomfort: [],
            timePressure: false,
          },
        },
      }),
    );
    expect(exhausted?.signal.domain).toBe('recovery');
    expect(exhausted?.signal.action).toMatchObject({
      kind: 'recalibrate',
      trigger: { type: 'duration', choice: 45 },
    });
  });

  it('reads both superset moves from logged rounds only and recommends longer rest when reps collapse', () => {
    const base = input([]);
    const superset = base.workout.blocks.find((block) => block.kind === 'superset') as WorkoutBlock;
    const [a] = superset.entries.map((entry) => entry.id) as [string, string];
    const active = input([], {
      status: 'active',
      completed: logged(base.workout, a, [[15, 1]]),
      workoutCount: 0,
    });
    // Everything before the superset counts as done for the position check.
    const keys = new Set(active.completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
    const position = currentPosition(active.workout, (id, index) => keys.has(`${id}:${index}`));
    const signals = gatherSignals({
      ...active,
      workout: { ...active.workout, blocks: [superset] },
    });
    const evidence = signals.find((signal) => signal.source === 'superset evidence');
    expect(position).not.toBeNull();
    expect(evidence?.headline).toMatch(/^Superset: .+ \+ .+$/);
    expect(evidence?.why.some((line) => line.includes('today 185×15'))).toBe(true);
    expect(evidence?.why[evidence.why.length - 1]).toBe(
      'Only logged rounds count; the next round starts from what you actually did.',
    );

    const fading = input([], {
      status: 'active',
      completed: logged(base.workout, 'e1', [
        [6, 1],
        [3, 0],
      ]),
      workoutCount: 0,
    });
    const rest = gatherSignals(fading).find((signal) => signal.domain === 'rest');
    expect(rest?.action).toMatchObject({ kind: 'rest', deltaSeconds: 30 });
    expect(rest?.why[0]).toBe('Reps fell from 6 to 3 with nothing in reserve.');
  });

  it('offers a safe optional drop set as a tip with a user-controlled action', () => {
    const history = [
      record(3, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
      ]),
    ];
    const workout = generateWorkout({
      profile,
      location: gym,
      history,
      now: NOW,
      duration: 'default',
    });
    const planned = allEntries(workout.blocks).some((entry) => entry.dropSet);
    const signals = gatherSignals(input(history, { workout, workoutCount: 1 }));
    const tip = signals.find((signal) => signal.source === 'drop-set opportunity');
    if (planned) {
      expect(tip).toBeUndefined();
    } else if (tip) {
      expect(tip.action).toMatchObject({
        kind: 'recalibrate',
        trigger: { type: 'drop-set', on: true },
      });
    }
    expect(
      signals.every((signal) => signal.action === null || signal.action.label.length > 0),
    ).toBe(true);
  });
});
