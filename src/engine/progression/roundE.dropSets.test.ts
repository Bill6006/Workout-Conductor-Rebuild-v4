import { describe, expect, it } from 'vitest';
import { EXERCISES, requireExercise } from '../../catalog/exercises/catalog';
import { isCoreStability } from '../../catalog/movementPatterns/movementPatterns';
import {
  CustomExerciseSchema,
  customToCatalogExercise,
} from '../../core/validation/customExercise';
import { createDefaultLocations } from '../../core/validation/location';
import {
  PROGRAM_STYLES,
  createDefaultProfile,
  type ProgramStyle,
} from '../../core/validation/profile';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork } from '../recalibration/types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyMaxes, recordMax } from './maxes';
import { CORE_STABILITY_RIR, prescribe, rirFloor } from './roles';
import { dropSetSuits, hasNoLoad } from './startingLoad';

/**
 * Maintenance 23, the owner's item 2: a Dead Bug got a drop set with no weight to drop, and a
 * target of RIR 0, where failure means the lower back lifting off the floor. No drop set on a
 * lift done at bodyweight or with a band, or on a core stability move; and a core stability move
 * keeps two reps in reserve, whatever the style, the role, or "make it harder" asks.
 */

const NOW = '2026-09-24T12:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const deadBug = requireExercise('dead-bug');
const pallof = requireExercise('pallof-press');
const fly = requireExercise('cable-fly');
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const styled = (programStyle: ProgramStyle) => ({ ...profile, programStyle });

describe('which exercises a drop set can suit', () => {
  it('none at bodyweight, with a band, or on a core stability move', () => {
    expect(deadBug.dropSetSafe).toBe(false);
    expect(pallof.dropSetSafe).toBe(false);
    // Listed with a bench, so their load type reads as a machine: no load all the same.
    for (const id of ['bench-dip', 'step-up']) {
      expect([id, requireExercise(id).dropSetSafe]).toEqual([id, false]);
    }
    for (const exercise of EXERCISES) {
      if (hasNoLoad(exercise) || isCoreStability(exercise.movementPattern)) {
        expect([exercise.id, exercise.dropSetSafe]).toEqual([exercise.id, false]);
      }
    }
  });

  it('keeps a loaded isolation move that suited one as it was', () => {
    expect(fly.dropSetSafe).toBe(true);
    expect(dropSetSuits(fly)).toBe(true);
  });

  it('holds for an exercise the lifter made, whatever its switch says', () => {
    const custom = (patch: Record<string, unknown>) =>
      customToCatalogExercise(
        CustomExerciseSchema.parse({
          id: 'custom-test-move',
          custom: true,
          name: 'Test Move',
          primaryMuscles: ['abs'],
          movementPattern: 'core-flexion',
          equipment: [['cable-station']],
          dropSetSafe: true,
          createdAt: NOW,
          updatedAt: NOW,
          ...patch,
        }),
      );
    expect(custom({}).dropSetSafe).toBe(true);
    expect(custom({ load: 'bodyweight', equipment: [[]] }).dropSetSafe).toBe(false);
    expect(custom({ load: 'band', equipment: [['resistance-bands']] }).dropSetSafe).toBe(false);
    expect(custom({ movementPattern: 'core-anti-rotation' }).dropSetSafe).toBe(false);
    expect(custom({ dropSetSafe: false }).dropSetSafe).toBe(false);
  });
});

describe('a core stability move and failure', () => {
  it('keeps two reps in reserve as a finisher under every style', () => {
    expect(rirFloor(deadBug)).toBe(CORE_STABILITY_RIR);
    expect(rirFloor(fly)).toBe(0);
    for (const style of PROGRAM_STYLES) {
      for (const role of ['finisher', 'isolation', 'corrective'] as const) {
        expect([style, role, prescribe(deadBug, role, styled(style)).rir >= 2]).toEqual([
          style,
          role,
          true,
        ]);
      }
    }
    // Anything else keeps its failure where the style allows it.
    expect(prescribe(fly, 'finisher', styled('hypertrophy-focus')).rir).toBe(0);
  });

  it('keeps them when the workout is made harder', () => {
    const harder = (place = gym) =>
      generateWorkout({
        profile: styled('hypertrophy-focus'),
        location: place,
        history: [],
        now: NOW,
        duration: 'default',
        constraints: { templateId: 'lower', adjust: { sets: 1, rir: -1, restFactor: 1 } },
      });
    for (const workout of [harder(gym), harder(home)]) {
      const core = allEntries(workout.blocks).filter((entry) =>
        isCoreStability(requireExercise(entry.exerciseId).movementPattern),
      );
      expect(core.length).toBeGreaterThan(0);
      for (const entry of core) {
        for (const set of entry.sets.filter((candidate) => candidate.kind !== 'warmup')) {
          expect([entry.exerciseId, set.targetRir]).toEqual([entry.exerciseId, 2]);
        }
      }
    }
    // A loaded finisher is still made harder.
    const loaded = allEntries(harder(gym).blocks).find(
      (entry) =>
        entry.role === 'finisher' &&
        !isCoreStability(requireExercise(entry.exerciseId).movementPattern),
    );
    if (loaded) {
      expect(loaded.sets.find((set) => set.kind === 'working')?.targetRir).toBe(0);
    }
  });

  it('keeps them through the engine’s own Make it harder', () => {
    const workout = generateWorkout({
      profile: styled('hypertrophy-focus'),
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    let current: GeneratedWorkout = workout;
    let constraints = emptyConstraints();
    for (let step = 0; step < 2; step += 1) {
      const result = recalibrate({
        trigger: { type: 'intensity', direction: 'harder' },
        workout: current,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: current.duration.choice,
        profile: { ...styled('hypertrophy-focus'), currentLocationId: 'gym' },
        location: gym,
        history: [],
        constraints,
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(result.error);
      current = result.workout;
      constraints = result.constraints;
    }
    const core = allEntries(current.blocks).filter((entry) =>
      isCoreStability(requireExercise(entry.exerciseId).movementPattern),
    );
    expect(core.length).toBeGreaterThan(0);
    for (const entry of core) {
      expect(entry.sets.every((set) => set.kind === 'warmup' || set.targetRir >= 2)).toBe(true);
    }
  });
});

describe('a core stability move picked up again', () => {
  it('keeps two reps in reserve in a workout made harder', () => {
    // The gym lower day ends with the Ab Wheel Rollout. One set logged, it stopped at a place
    // with no wheel; back at the gym it picks up its owed sets as the workout is made harder.
    const hard = styled('hypertrophy-focus');
    const workout = generateWorkout({
      profile: hard,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    const wheel = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'ab-wheel-rollout',
    );
    if (!wheel) throw new Error('no ab wheel');
    const working = wheel.sets.filter((set) => set.kind === 'working');
    const first = working[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 30 * 60,
      sets: [
        {
          entryId: wheel.id,
          exerciseId: wheel.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 8,
          weight: null,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    wheel.sets = [first];
    wheel.stopped = { owed: working.length - 1, why: 'place' };
    const result = recalibrate({
      trigger: { type: 'intensity', direction: 'harder' },
      workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile: { ...hard, currentLocationId: 'gym' },
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const back = allEntries(result.workout.blocks).find((entry) => entry.id === wheel.id);
    expect(back?.stopped).toBeUndefined();
    const picked = (back?.sets ?? []).filter(
      (set) => set.kind === 'working' && set.index !== first.index,
    );
    expect(picked.length).toBeGreaterThan(0);
    for (const set of picked) expect(set.targetRir).toBe(CORE_STABILITY_RIR);
  });
});

describe('the plan’s one drop set', () => {
  it('never lands on a lift with no weight to drop or a core stability move', () => {
    const allowed = { ...styled('hypertrophy-focus') };
    allowed.techniques = { ...allowed.techniques, dropSets: true };
    let dropSets = 0;
    for (const place of [home, gym]) {
      for (const templateId of ['lower', 'push-arms', 'pull-arms', 'upper', 'full-body']) {
        for (const duration of [15, 30, 45, 'default'] as const) {
          const workout = generateWorkout({
            profile: allowed,
            location: place,
            history: [],
            now: NOW,
            duration,
            constraints: { templateId },
          });
          for (const entry of allEntries(workout.blocks).filter((item) => item.dropSet)) {
            dropSets += 1;
            const exercise = requireExercise(entry.exerciseId);
            expect([entry.exerciseId, dropSetSuits(exercise)]).toEqual([entry.exerciseId, true]);
          }
        }
      }
    }
    // The sweep did plan drop sets, on the moves that suit one.
    expect(dropSets).toBeGreaterThan(0);
  });

  it('comes off a plan saved before the Dead Bug stopped suiting one, badge and all', () => {
    const workout = generateWorkout({
      profile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    // As the owner's plan had it: a drop set on the Dead Bug.
    const bug = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'dead-bug');
    if (!bug) throw new Error('no dead bug');
    bug.dropSet = true;
    bug.sets.push({
      index: bug.sets.length,
      kind: 'drop',
      targetReps: [8, 12],
      targetRir: 0,
      targetWeight: null,
      restSeconds: 0,
    });
    const refreshed = recalibrate({
      trigger: { type: 'loading' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile: { ...profile, currentLocationId: 'home' },
      location: home,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!refreshed.ok) throw new Error(refreshed.error);
    const after = allEntries(refreshed.workout.blocks).find((entry) => entry.id === bug.id);
    expect(after?.dropSet).toBe(false);
    expect(after?.sets.some((set) => set.kind === 'drop')).toBe(false);
  });

  it('comes off the Dead Bug when a max entered refreshes it', () => {
    const workout = generateWorkout({
      profile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    const bug = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'dead-bug');
    if (!bug) throw new Error('no dead bug');
    bug.dropSet = true;
    bug.sets.push({
      index: bug.sets.length,
      kind: 'drop',
      targetReps: [8, 12],
      targetRir: 0,
      targetWeight: null,
      restSeconds: 0,
    });
    // A max for another lift refreshes every lift never logged, the Dead Bug included.
    const lift = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId !== 'dead-bug' && entry.progression?.mode === 'start',
    );
    if (!lift) throw new Error('no other lift never logged');
    const refreshed = recalibrate({
      trigger: { type: 'max', exerciseId: lift.exerciseId },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile: { ...profile, currentLocationId: 'home' },
      location: home,
      history: [],
      constraints: emptyConstraints(),
      maxes: recordMax(emptyMaxes(), lift.exerciseId, { kind: 'max', e1rm: 200 }, 'lb', NOW),
      reason: 'test',
      timestamp: NOW,
    });
    if (!refreshed.ok) throw new Error(refreshed.error);
    const after = allEntries(refreshed.workout.blocks).find((entry) => entry.id === bug.id);
    expect(after?.dropSet).toBe(false);
    expect(after?.sets.some((set) => set.kind === 'drop')).toBe(false);
  });

  it('refuses one added by hand to the Dead Bug', () => {
    const workout = generateWorkout({
      profile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    // The owner's lower day: the Dead Bug closes it.
    const bug = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'dead-bug');
    expect(bug).toBeDefined();
    expect(bug!.dropSet).toBe(false);
    const refused = recalibrate({
      trigger: { type: 'drop-set', entryId: bug!.id, on: true },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile: { ...profile, currentLocationId: 'home' },
      location: home,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe('Dead Bug is not safe for a drop set.');
  });
});
