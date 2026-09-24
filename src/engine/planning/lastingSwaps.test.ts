import { describe, expect, it } from 'vitest';
import {
  createDefaultLocations,
  createLocation,
  type LocationProfile,
} from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { requireExercise } from '../../catalog/exercises/catalog';
import { checkWorkoutConflicts } from '../conflicts/conflictEngine';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../recalibration/types';
import { allEntries, isStopped, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout, sessionConflictContext } from '../workoutGenerator/generate';
import {
  SWAP_WEEKS,
  lastingSwapsRecord,
  parseLastingSwaps,
  undoSwaps,
  withSwap,
  withoutSwap,
  type LastingSwap,
} from './lastingSwaps';

/** Maintenance 22, item 23: a swap the lifter chose to keep for a few weeks. */

const NOW = '2026-09-23T17:00:00.000Z';
const DAY = 86_400_000;
const later = (days: number) => new Date(Date.parse(NOW) + days * DAY).toISOString();
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };

const plan = (place: LocationProfile | undefined, swaps: readonly LastingSwap[] = []) =>
  generateWorkout({
    profile,
    location: place,
    history: [],
    now: NOW,
    duration: 'default',
    constraints: { swaps },
  });

describe('the list of lasting swaps', () => {
  it('keeps a swap for four weeks', () => {
    const [swap] = withSwap([], 'barbell-bench-press', 'dumbbell-bench-press', NOW);
    expect(swap).toEqual({
      from: 'barbell-bench-press',
      to: 'dumbbell-bench-press',
      setAt: NOW,
      until: later(SWAP_WEEKS * 7),
    });
  });

  it('keeps one swap per exercise, the latest', () => {
    const first = withSwap([], 'barbell-bench-press', 'dumbbell-bench-press', NOW);
    const second = withSwap(first, 'barbell-bench-press', 'machine-chest-press', later(1));
    expect(second.map((swap) => [swap.from, swap.to])).toEqual([
      ['barbell-bench-press', 'machine-chest-press'],
    ]);
  });

  it('carries a swap of a swapped-in exercise to the latest pick, and ends a swap back', () => {
    const first = withSwap([], 'barbell-bench-press', 'dumbbell-bench-press', NOW);
    const chained = withSwap(first, 'dumbbell-bench-press', 'machine-chest-press', NOW);
    expect(chained.map((swap) => [swap.from, swap.to])).toEqual([
      ['barbell-bench-press', 'machine-chest-press'],
      ['dumbbell-bench-press', 'machine-chest-press'],
    ]);
    // Kept exactly back: the first swap ends and nothing new is kept.
    expect(withSwap(first, 'dumbbell-bench-press', 'barbell-bench-press', NOW)).toEqual([]);
    expect(withoutSwap(chained, 'barbell-bench-press')).toHaveLength(1);
  });

  it('gives a swap carried to a new pick the weeks of the new swap', () => {
    const first = withSwap([], 'barbell-bench-press', 'dumbbell-bench-press', NOW);
    const chained = withSwap(first, 'dumbbell-bench-press', 'machine-chest-press', later(21));
    expect(chained).toEqual([
      {
        from: 'barbell-bench-press',
        to: 'machine-chest-press',
        setAt: later(21),
        until: later(21 + SWAP_WEEKS * 7),
      },
      {
        from: 'dumbbell-bench-press',
        to: 'machine-chest-press',
        setAt: later(21),
        until: later(21 + SWAP_WEEKS * 7),
      },
    ]);
  });

  it('leaves a swap of another exercise as it was', () => {
    const machine = withSwap([], 'dumbbell-bench-press', 'machine-chest-press', NOW);
    const both = withSwap(machine, 'incline-dumbbell-press', 'dumbbell-bench-press', NOW);
    expect(both.map((swap) => [swap.from, swap.to])).toEqual([
      ['dumbbell-bench-press', 'machine-chest-press'],
      ['incline-dumbbell-press', 'dumbbell-bench-press'],
    ]);
  });

  it('takes back only what one change did', () => {
    const earlier = withSwap([], 'barbell-row', 'cable-row', NOW);
    const kept = withSwap(earlier, 'barbell-bench-press', 'dumbbell-bench-press', NOW);
    // Nothing else changed: this change's swap goes, the earlier one stays.
    expect(undoSwaps(kept, earlier, kept)).toEqual(earlier);
    // The earlier swap was stopped on the Plan tab since: Undo does not bring it back.
    expect(undoSwaps(withoutSwap(kept, 'barbell-row'), earlier, kept)).toEqual([]);
    // A swap this change replaced comes back as it was.
    const replaced = withSwap(earlier, 'barbell-row', 'machine-row', NOW);
    expect(undoSwaps(replaced, earlier, replaced)).toEqual(earlier);
    // Changed again since: left as it is now.
    const since = withSwap(kept, 'barbell-bench-press', 'machine-chest-press', later(1));
    expect(undoSwaps(since, earlier, kept)).toEqual(since);
  });

  it('reads a stored list tolerantly, keeping what another device may know', () => {
    const good = withSwap([], 'barbell-bench-press', 'dumbbell-bench-press', NOW);
    // A custom exercise not synced to this device yet: kept, so a save here never deletes it.
    const elsewhere = {
      from: 'custom-cable-press',
      to: 'dumbbell-bench-press',
      setAt: NOW,
      until: later(9),
    };
    const stored = {
      ...lastingSwapsRecord(good),
      swaps: [
        ...good,
        elsewhere,
        { from: 'chin-up', to: 'lat-pulldown', until: later(-1) },
        { from: 'chin-up', to: 'chin-up', until: later(9) },
        { from: 'chin-up', until: later(9) },
        'junk',
      ],
    };
    expect(parseLastingSwaps(stored, NOW)).toEqual([...good, elsewhere]);
    expect(parseLastingSwaps(null, NOW)).toEqual([]);
    expect(parseLastingSwaps({ swaps: 'x' }, NOW)).toEqual([]);
    // Past its four weeks, it reads as none.
    expect(parseLastingSwaps(stored, later(SWAP_WEEKS * 7))).toEqual([]);
  });
});

describe('the plan with a lasting swap', () => {
  const swap = withSwap([], 'barbell-bench-press', 'dumbbell-bench-press', NOW);

  it('picks the exercise swapped in, and says why', () => {
    const before = allEntries(plan(gym).blocks).map((entry) => entry.exerciseId);
    expect(before[0]).toBe('barbell-bench-press');
    const workout = plan(gym, swap);
    const after = allEntries(workout.blocks).map((entry) => entry.exerciseId);
    expect(after[0]).toBe('dumbbell-bench-press');
    expect(after).not.toContain('barbell-bench-press');
    expect(workout.explanation.reasons).toContain(
      'Dumbbell Bench Press in place of Barbell Bench Press, the swap you chose to keep.',
    );
  });

  it('keeps the plan’s own pick where the exercise swapped in does not fit', () => {
    const barbellOnly = createLocation(
      {
        id: 'garage',
        name: 'Garage',
        kind: 'custom',
        equipment: ['barbell', 'flat-bench', 'squat-rack'],
      },
      NOW,
    );
    const workout = plan(barbellOnly, swap);
    const ids = allEntries(workout.blocks).map((entry) => entry.exerciseId);
    expect(ids).toContain('barbell-bench-press');
    expect(ids).not.toContain('dumbbell-bench-press');
    expect(workout.explanation.reasons.some((line) => line.includes('the swap you chose'))).toBe(
      false,
    );
  });

  it('keeps the exercise swapped out out of every other slot too', () => {
    // A pull day has two curl slots: the swap covers both, not just the first.
    const curls = withSwap([], 'ez-bar-curl', 'cable-curl', NOW);
    const ids = (swaps: readonly LastingSwap[]) =>
      allEntries(
        generateWorkout({
          profile,
          location: gym,
          history: [],
          now: NOW,
          duration: 'default',
          constraints: { swaps, templateId: 'pull-arms' },
        }).blocks,
      ).map((entry) => entry.exerciseId);
    expect(ids([])).toContain('ez-bar-curl');
    expect(ids(curls)).toContain('cable-curl');
    expect(ids(curls)).not.toContain('ez-bar-curl');
  });

  it('keeps the exercise swapped out out when its swap-in is already in, and says so', () => {
    // The bench press leads the push day on its own merits: the incline slot takes the next
    // best, never the incline dumbbell press swapped out.
    const toBench = withSwap([], 'incline-dumbbell-press', 'barbell-bench-press', NOW);
    const workout = plan(gym, toBench);
    const ids = allEntries(workout.blocks).map((entry) => entry.exerciseId);
    expect(ids).not.toContain('incline-dumbbell-press');
    expect(ids.filter((id) => id === 'barbell-bench-press')).toHaveLength(1);
    expect(ids).toHaveLength(allEntries(plan(gym).blocks).length);
    expect(workout.explanation.reasons).toContain(
      'Incline Barbell Bench Press in place of Incline Dumbbell Press, which you swapped out.',
    );
  });

  it('says a slot took the next best only where the exercise swapped out was its own pick', () => {
    // A pull day's second curl slot picks the dumbbell curl with or without the swap.
    const curls = withSwap([], 'ez-bar-curl', 'cable-curl', NOW);
    const pull = (swaps: readonly LastingSwap[]) =>
      generateWorkout({
        profile,
        location: gym,
        history: [],
        now: NOW,
        duration: 'default',
        constraints: { swaps, templateId: 'pull-arms' },
      });
    const bySlot = (workout: ReturnType<typeof pull>, slot: number) =>
      allEntries(workout.blocks).find((entry) => entry.slot === slot)?.exerciseId;
    expect([bySlot(pull([]), 3), bySlot(pull([]), 6)]).toEqual(['ez-bar-curl', 'dumbbell-curl']);
    const kept = pull(curls);
    expect([bySlot(kept, 3), bySlot(kept, 6)]).toEqual(['cable-curl', 'dumbbell-curl']);
    expect(kept.explanation.reasons).toContain(
      'Cable Curl in place of EZ-Bar Curl, the swap you chose to keep.',
    );
    expect(
      kept.explanation.reasons.filter((line) => line.includes('which you swapped out')),
    ).toEqual([]);
  });

  it('names a kept swap only while the exercise swapped in is in the workout', () => {
    const raise = withSwap([], 'lateral-raise', 'cable-lateral-raise', NOW);
    const short = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 15,
      constraints: { swaps: raise },
    });
    const ids = allEntries(short.blocks).map((entry) => entry.exerciseId);
    expect(ids).not.toContain('cable-lateral-raise');
    expect(
      short.explanation.reasons.filter((line) => line.includes('the swap you chose to keep')),
    ).toEqual([]);
  });

  it('never puts an exercise in twice', () => {
    // The push day's incline slot would pick it too: it goes in once.
    const toSecond = withSwap([], 'barbell-bench-press', 'incline-dumbbell-press', NOW);
    const ids = allEntries(plan(gym, toSecond).blocks).map((entry) => entry.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// The fourth review of Maintenance 22: each case below failed before its fix.
describe('a kept swap through a rebuild', () => {
  const curls = withSwap([], 'ez-bar-curl', 'cable-curl', NOW);
  const atGymProfile = { ...profile, currentLocationId: 'gym' };
  function run(
    trigger: RecalibrationTrigger,
    workout: GeneratedWorkout,
    completed: CompletedWork = emptyCompleted(),
  ): RecalibrationSuccess {
    const result = recalibrate({
      trigger,
      workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: completed.currentEntryId,
      duration: workout.duration.choice,
      profile: atGymProfile,
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      swaps: curls,
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  }
  const fresh = () =>
    generateWorkout({
      profile: atGymProfile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { swaps: curls, templateId: 'pull-arms' },
    });
  const bySlot = (workout: GeneratedWorkout, slot: number) =>
    allEntries(workout.blocks).find((entry) => entry.slot === slot);
  const KEPT = 'Cable Curl in place of EZ-Bar Curl, the swap you chose to keep.';
  const aroundLines = (workout: GeneratedWorkout) =>
    workout.explanation.reasons.filter((line) => line.includes('which you swapped out'));

  it('keeps its line, and no false one, when the swapped-in exercise is pinned', () => {
    const plan = fresh();
    const pinned = run({ type: 'pin', entryId: bySlot(plan, 3)!.id, pinned: true }, plan).workout;
    const rebuilt = run({ type: 'duration', choice: 45 }, pinned).workout;
    expect([bySlot(rebuilt, 3)?.exerciseId, bySlot(rebuilt, 6)?.exerciseId]).toEqual([
      'cable-curl',
      'dumbbell-curl',
    ]);
    expect(aroundLines(rebuilt)).toEqual([]);
    expect(rebuilt.explanation.reasons).toContain(KEPT);
  });

  it('keeps its line, and no false one, when a set of the swapped-in exercise is logged', () => {
    const plan = fresh();
    const cable = bySlot(plan, 3)!;
    const set = cable.sets.find((candidate) => candidate.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 60,
      currentEntryId: cable.id,
      sets: [
        {
          entryId: cable.id,
          exerciseId: cable.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 10,
          weight: 40,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const rebuilt = run({ type: 'duration', choice: 45 }, plan, completed).workout;
    expect(bySlot(rebuilt, 6)?.exerciseId).toBe('dumbbell-curl');
    expect(aroundLines(rebuilt)).toEqual([]);
    expect(rebuilt.explanation.reasons).toContain(KEPT);
  });
});

describe('a kept swap that brings in a lift of another pattern', () => {
  const garage = createLocation(
    {
      id: 'garage',
      name: 'Garage',
      kind: 'custom',
      equipment: ['barbell', 'squat-rack', 'trap-bar', 'flat-bench'],
    },
    NOW,
  );
  const inGarage = { ...profile, currentLocationId: 'garage' };
  const toTrapBar = withSwap([], 'back-squat', 'trap-bar-deadlift', NOW);
  const lower = () =>
    generateWorkout({
      profile: inGarage,
      location: garage,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { swaps: toTrapBar, templateId: 'lower' },
    });

  it('never leaves two lifts that clash, and the plan can still change', () => {
    const workout = lower();
    const ids = allEntries(workout.blocks).map((entry) => entry.exerciseId);
    expect(ids).toContain('trap-bar-deadlift');
    const blocking = checkWorkoutConflicts(
      ids.map((id) => requireExercise(id)),
      sessionConflictContext(inGarage, garage),
    ).filter((conflict) => conflict.severity === 'block');
    expect(blocking.map((conflict) => conflict.message)).toEqual([]);
    const last = allEntries(workout.blocks).at(-1)!;
    const pinned = recalibrate({
      trigger: { type: 'pin', entryId: last.id, pinned: true },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile: inGarage,
      location: garage,
      history: [],
      constraints: emptyConstraints(),
      swaps: toTrapBar,
      reason: 'test',
      timestamp: NOW,
    });
    expect(pinned.ok ? 'ok' : pinned.error).toBe('ok');
  });
});

// The fifth review of Maintenance 22: each case below failed before its fix.
describe('a kept swap whose exercise cannot join the day', () => {
  it('leaves the plan’s own pick in its slot rather than an empty one', () => {
    const lowerDay = (swaps: readonly LastingSwap[]) =>
      generateWorkout({
        profile,
        location: gym,
        history: [],
        now: NOW,
        duration: 'default',
        constraints: { templateId: 'lower', swaps },
      });
    const plain = allEntries(lowerDay([]).blocks).map((entry) => entry.exerciseId);
    expect(plain).toContain('back-squat');
    expect(plain).toContain('leg-extension');
    // Front Squat cannot join a day led by Back Squat, and nothing else extends the knee here.
    const kept = lowerDay(withSwap([], 'leg-extension', 'front-squat', NOW));
    const ids = allEntries(kept.blocks).map((entry) => entry.exerciseId);
    expect(ids).not.toContain('front-squat');
    expect(ids).toContain('leg-extension');
    expect(ids).toHaveLength(plain.length);
    expect(kept.compromises.filter((line) => line.startsWith('No '))).toEqual([]);
    expect(kept.explanation.reasons.filter((line) => line.includes('Leg Extension'))).toEqual([]);
  });
});

// The sixth review of Maintenance 22: each case below failed before its fix.
describe('a kept swap’s exercise stopped at a place without its equipment', () => {
  it('gets the plan’s own pick as its stand-in where the kept swap does not fit', () => {
    const garage = createLocation(
      {
        id: 'garage',
        name: 'Garage',
        kind: 'custom',
        equipment: ['barbell', 'flat-bench', 'squat-rack'],
      },
      NOW,
    );
    const swaps = withSwap([], 'barbell-bench-press', 'dumbbell-bench-press', NOW);
    const kept = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { swaps },
    });
    const lead = allEntries(kept.blocks)[0]!;
    expect(lead.standsFor).toBe('barbell-bench-press');
    const started = (entry: WorkoutEntry): CompletedWork => {
      const first = entry.sets.findIndex((set) => set.kind === 'working');
      return {
        ...emptyCompleted(),
        startedAt: NOW,
        elapsedSeconds: 600,
        currentEntryId: entry.id,
        sets: entry.sets.slice(0, first + 1).map((set) => ({
          entryId: entry.id,
          exerciseId: entry.exerciseId,
          setIndex: set.index,
          kind: set.kind,
          reps: 8,
          weight: 40,
          rir: 2,
          completedAt: NOW,
        })),
      };
    };
    const moved = recalibrate({
      trigger: { type: 'location' },
      workout: kept,
      completed: started(lead),
      lockedEntryIds: [],
      currentEntryId: lead.id,
      duration: kept.duration.choice,
      profile: { ...profile, currentLocationId: 'garage' },
      location: garage,
      history: [],
      constraints: emptyConstraints(),
      swaps,
      reason: 'test',
      timestamp: NOW,
    });
    if (!moved.ok) throw new Error(moved.error);
    const standIn = allEntries(moved.workout.blocks).find(
      (entry) => entry.slot === 0 && !isStopped(entry),
    );
    expect(standIn?.exerciseId).toBe('barbell-bench-press');
  });
});
