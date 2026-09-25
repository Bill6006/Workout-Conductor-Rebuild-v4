import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { DUMBBELLS_KEY } from '../loading/loading';
import { emptyMaxes, recordMax } from '../progression/maxes';
import { RECORD_NOW, record } from '../../test/records';
import { rirFloor } from '../progression/roles';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  Readiness,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';

/**
 * Maintenance 24, the owner's item 34 (docs/research/effort-setting.md). "Make it harder" or
 * "easier" and a check-in's own adjustment hold through every rebuild of the rest of the workout,
 * and a lift re-targeted on its own (its weights refitted, a max, a swap) keeps the effort it
 * carries, as far as the day's settings still reach.
 */

const NOW = '2026-09-03T14:00:00.000Z';
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const bench = 'barbell-bench-press';

const plan = (): GeneratedWorkout =>
  generateWorkout({ profile, location: gym, history: [], now: NOW, duration: 'default' });

function run(
  trigger: RecalibrationTrigger,
  overrides: Partial<RecalibrationRequest> = {},
): RecalibrationSuccess {
  const workout = overrides.workout ?? plan();
  const result = recalibrate({
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: workout.duration.choice,
    profile,
    location: gym,
    history: [],
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

const entryOf = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry => {
  const found = allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId);
  if (!found) throw new Error(`no ${exerciseId}`);
  return found;
};
/** The reps in reserve an entry's working sets ask for, the logged ones left out. */
const rirOf = (entry: WorkoutEntry, completed: CompletedWork = emptyCompleted()): number[] =>
  entry.sets
    .filter(
      (set) =>
        set.kind === 'working' &&
        !completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
    )
    .map((set) => set.targetRir);
const firstRir = (workout: GeneratedWorkout, exerciseId: string): number =>
  rirOf(entryOf(workout, exerciseId))[0] as number;
/** One rep closer to failure, or further, within the reserve the exercise allows. */
const moved = (exerciseId: string, rir: number, by: number): number =>
  Math.min(4, Math.max(rirFloor(requireExercise(exerciseId)), rir + by));
const exerciseIds = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => entry.exerciseId);

const tired: Readiness = {
  energy: 2,
  soreness: 3,
  sleep: 2,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};
const fine: Readiness = { ...tired, energy: 4, sleep: 4, motivation: 4, soreness: 2 };

/** The session after "Make it harder" (level 1) or "Make it easier" (level -1). */
function withIntensity(direction: 'harder' | 'easier'): RecalibrationSuccess {
  return run({ type: 'intensity', direction });
}

/** Logs a lift's warm-ups and its first working set at the targets; it becomes the current lift. */
function logFirstSet(workout: GeneratedWorkout, exerciseId: string): CompletedWork {
  const entry = entryOf(workout, exerciseId);
  const first = entry.sets.find((set) => set.kind === 'working');
  if (!first) throw new Error('no working set');
  return {
    startedAt: NOW,
    elapsedSeconds: 8 * 60,
    currentEntryId: entry.id,
    sets: entry.sets
      .filter((set) => set.index <= first.index)
      .map((set) => ({
        entryId: entry.id,
        exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: set.targetReps[1],
        weight: set.targetWeight,
        rir: set.targetRir,
        completedAt: NOW,
      })),
  };
}

describe('Make it harder or easier through a rebuild', () => {
  it('a change of length keeps Make it harder on every lift still to come', () => {
    const harder = withIntensity('harder');
    const shorter = run(
      { type: 'duration', choice: 45 },
      { workout: harder.workout, constraints: harder.constraints },
    );
    const plain = run({ type: 'duration', choice: 45 });
    const shared = exerciseIds(shorter.workout).filter((id) =>
      exerciseIds(plain.workout).includes(id),
    );
    expect(shared.length).toBeGreaterThanOrEqual(4);
    for (const id of shared) {
      expect(firstRir(shorter.workout, id)).toBe(moved(id, firstRir(plain.workout, id), -1));
    }
    // The bench press asks 2 in reserve on a plain day, 1 with Make it harder.
    expect([firstRir(plain.workout, bench), firstRir(shorter.workout, bench)]).toEqual([2, 1]);
  });

  it('a change of place keeps Make it easier', () => {
    const easier = withIntensity('easier');
    const atHome = run(
      { type: 'location' },
      { workout: easier.workout, constraints: easier.constraints, location: home },
    );
    const plain = run({ type: 'location' }, { location: home });
    const shared = exerciseIds(atHome.workout).filter((id) =>
      exerciseIds(plain.workout).includes(id),
    );
    expect(shared.length).toBeGreaterThanOrEqual(4);
    for (const id of shared) {
      expect(firstRir(atHome.workout, id)).toBe(moved(id, firstRir(plain.workout, id), 1));
    }
  });

  it('a technique switched on keeps Make it harder', () => {
    const harder = withIntensity('harder');
    const switched = run(
      { type: 'technique', technique: 'circuits' },
      {
        workout: harder.workout,
        constraints: harder.constraints,
        profile: { ...profile, techniques: { ...profile.techniques, circuits: true } },
      },
    );
    const before = plan();
    const shared = exerciseIds(switched.workout).filter((id) => exerciseIds(before).includes(id));
    expect(shared.length).toBeGreaterThanOrEqual(4);
    for (const id of shared) {
      expect(firstRir(switched.workout, id)).toBe(moved(id, firstRir(before, id), -1));
    }
  });

  it("a change of length or place keeps a low check-in's adjustment", () => {
    // What a lifter sees today: the check-in is on the screen, the harder setting is not.
    const checkedIn = run({ type: 'readiness', readiness: tired });
    const settings = { workout: checkedIn.workout, constraints: checkedIn.constraints };
    const cases: [RecalibrationSuccess, RecalibrationSuccess][] = [
      [run({ type: 'duration', choice: 45 }, settings), run({ type: 'duration', choice: 45 })],
      [
        run({ type: 'location' }, { ...settings, location: home }),
        run({ type: 'location' }, { location: home }),
      ],
    ];
    for (const [kept, plain] of cases) {
      const shared = exerciseIds(kept.workout).filter((id) =>
        exerciseIds(plain.workout).includes(id),
      );
      expect(shared.length).toBeGreaterThanOrEqual(4);
      for (const id of shared) {
        expect(firstRir(kept.workout, id)).toBe(moved(id, firstRir(plain.workout, id), 1));
      }
    }
  });

  it('a check-in back to fine brings the planned sets and effort back, and says so', () => {
    const before = plan();
    const low = run({ type: 'readiness', readiness: tired });
    const back = run(
      { type: 'readiness', readiness: fine },
      { workout: low.workout, constraints: low.constraints },
    );
    expect(back.summary.headline).toMatch(/^Planned sets and effort back: /);
    for (const id of exerciseIds(back.workout).filter((x) => exerciseIds(before).includes(x))) {
      expect(firstRir(back.workout, id)).toBe(firstRir(before, id));
    }
    const working = (workout: GeneratedWorkout) =>
      entryOf(workout, bench).sets.filter((set) => set.kind === 'working').length;
    expect(working(back.workout)).toBe(working(before));
    // With nothing to take back, a fine check-in changes nothing.
    const kept = run({ type: 'readiness', readiness: fine }, { workout: before });
    expect(kept.summary.headline).toBe('Feeling good: full workout kept.');
    expect(kept.workout.blocks).toEqual(before.blocks);
  });

  it('a check-in reaches the lift in front until its first set is logged, both ways', () => {
    const before = plan();
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    const low = run({ type: 'readiness', readiness: tired });
    const first = allEntries(low.workout.blocks)[0]!;
    // Started, nothing logged yet: the first lift is in front.
    const inFront = (entryId: string): CompletedWork => ({
      startedAt: NOW,
      elapsedSeconds: 60,
      currentEntryId: entryId,
      sets: [],
    });
    const back = run(
      { type: 'readiness', readiness: fine },
      {
        workout: low.workout,
        constraints: low.constraints,
        completed: inFront(first.id),
        currentEntryId: first.id,
      },
    );
    const planned = entryOf(before, first.exerciseId);
    const restored = entryOf(back.workout, first.exerciseId);
    expect(working(entryOf(low.workout, first.exerciseId)).length).toBeLessThan(
      working(planned).length,
    );
    expect(working(restored)).toHaveLength(working(planned).length);
    expect(working(restored).map((set) => set.targetRir)).toEqual(
      working(planned).map((set) => set.targetRir),
    );
    expect(back.summary.headline).toMatch(/^Planned sets and effort back: /);
    // The other way: a low check-in right after Start takes the lift in front down too.
    const start = allEntries(before.blocks)[0]!;
    const cut = run(
      { type: 'readiness', readiness: tired },
      { workout: before, completed: inFront(start.id), currentEntryId: start.id },
    );
    const lowFirst = entryOf(low.workout, start.exerciseId);
    const cutFirst = entryOf(cut.workout, start.exerciseId);
    expect(working(cutFirst)).toHaveLength(working(lowFirst).length);
    expect(working(cutFirst).map((set) => set.targetRir)).toEqual(
      working(lowFirst).map((set) => set.targetRir),
    );
  });

  it('the lift in front keeps its sets when the coach added it, the lifter set its reps, or it stands in', () => {
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    const low = run({ type: 'readiness', readiness: tired });
    const [first, second] = allEntries(low.workout.blocks) as [WorkoutEntry, WorkoutEntry];
    const backWith = (change: (entry: WorkoutEntry, other: WorkoutEntry) => void) => {
      const workout = structuredClone(low.workout);
      const [lift, other] = allEntries(workout.blocks) as [WorkoutEntry, WorkoutEntry];
      change(lift, other);
      const back = run(
        { type: 'readiness', readiness: fine },
        {
          workout,
          constraints: low.constraints,
          completed: { startedAt: NOW, elapsedSeconds: 60, currentEntryId: lift.id, sets: [] },
          currentEntryId: lift.id,
        },
      );
      return working(entryOf(back.workout, lift.exerciseId));
    };
    const cut = working(first);
    expect(
      backWith((lift) => {
        // As the coach adds one: locked, outside the plan's places.
        lift.locked = true;
        delete lift.slot;
      }),
    ).toHaveLength(cut.length);
    expect(
      backWith((lift) => {
        lift.manual = { reps: true };
      }),
    ).toHaveLength(cut.length);
    // Standing in for a lift stopped in its slot: it carries the sets that lift still owed.
    expect(
      backWith((lift, other) => {
        other.slot = lift.slot;
        other.stopped = { owed: cut.length, why: 'place' };
      }),
    ).toHaveLength(cut.length);
    expect(second).toBeDefined();
  });

  it('the lift in front keeps its drop set, and takes Make it harder too', () => {
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    const before = plan();
    const workout = structuredClone(before);
    const lift = allEntries(workout.blocks)[0]!;
    lift.dropSet = true;
    lift.sets.push({
      index: lift.sets.length,
      kind: 'drop',
      targetReps: [8, 12],
      targetRir: 0,
      targetWeight: null,
      restSeconds: 0,
    });
    const started: CompletedWork = {
      startedAt: NOW,
      elapsedSeconds: 60,
      currentEntryId: lift.id,
      sets: [],
    };
    const low = run(
      { type: 'readiness', readiness: tired },
      { workout, completed: started, currentEntryId: lift.id },
    );
    const settled = entryOf(low.workout, lift.exerciseId);
    expect(settled.sets.filter((set) => set.kind === 'drop')).toHaveLength(1);
    expect(settled.sets.at(-1)?.kind).toBe('drop');
    // Make it harder, the lift in front not begun: a rep less in reserve on it too.
    const harder = run(
      { type: 'intensity', direction: 'harder' },
      { workout: before, completed: started, currentEntryId: lift.id },
    );
    const plainRir = working(lift)[0]!.targetRir;
    expect(working(entryOf(harder.workout, lift.exerciseId))[0]!.targetRir).toBe(
      moved(lift.exerciseId, plainRir, -1),
    );
  });

  it('at 15 and 30 minutes the lift in front keeps its floor, and the words say only what moved', () => {
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    const short = (duration: 15 | 30) =>
      generateWorkout({
        profile,
        location: gym,
        history: [],
        now: NOW,
        duration,
        constraints: { templateId: 'push-arms' },
      });
    const plan15 = short(15);
    const first = allEntries(plan15.blocks)[0]!;
    const started = (entryId: string): CompletedWork => ({
      startedAt: NOW,
      elapsedSeconds: 60,
      currentEntryId: entryId,
      sets: [],
    });
    const counts = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks).map((entry) => working(entry).length);
    // Start, then Drained: the bench is at its floor of 3 already, so only the reserve moves, and
    // nothing comes in on minutes a cut never freed.
    const drained = run(
      { type: 'readiness', readiness: tired },
      { workout: plan15, completed: started(first.id), currentEntryId: first.id },
    );
    expect(counts(drained.workout)).toEqual(counts(plan15));
    expect(drained.summary.headline).toMatch(/^Adjusted for today \(an extra rep in reserve\): /);
    // Drained before Start, then Start, then Good: the plan as it was, and "effort", not sets, back.
    const low = run({ type: 'readiness', readiness: tired }, { workout: plan15 });
    const lowFirst = allEntries(low.workout.blocks)[0]!;
    const good = run(
      { type: 'readiness', readiness: fine },
      {
        workout: low.workout,
        constraints: low.constraints,
        completed: started(lowFirst.id),
        currentEntryId: lowFirst.id,
      },
    );
    expect(counts(good.workout)).toEqual(counts(plan15));
    expect(good.summary.headline).toMatch(/^Planned effort back: /);
    expect(good.workout.duration.overByMinutes).toBeLessThanOrEqual(1);
    // At 30 minutes the sets are at their fewest: no word of fewer sets.
    const low30 = run({ type: 'readiness', readiness: tired }, { workout: short(30) });
    expect(low30.summary.headline).toMatch(/^Adjusted for today \(an extra rep in reserve\): /);
  });

  it('a lift you pinned or swapped in, nothing logged yet, takes the check-in too', () => {
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    const before = plan();
    const pinnedPlan = structuredClone(before);
    const second = allEntries(pinnedPlan.blocks)[1]!;
    second.pinned = true;
    const low = run({ type: 'readiness', readiness: tired }, { workout: pinnedPlan });
    const planned = entryOf(before, second.exerciseId);
    const cut = entryOf(low.workout, second.exerciseId);
    expect(working(cut)).toHaveLength(working(planned).length - 1);
    expect(working(cut)[0]!.targetRir).toBe(
      moved(second.exerciseId, working(planned)[0]!.targetRir, 1),
    );
    // Swapped in before the check-in: locked in the plan's place, and the check-in reaches it.
    const lowPlain = run({ type: 'readiness', readiness: tired });
    const third = allEntries(lowPlain.workout.blocks)[2]!;
    const swap = run(
      { type: 'replace', entryId: third.id, exerciseId: 'machine-shoulder-press' },
      { workout: lowPlain.workout, constraints: lowPlain.constraints },
    );
    const swappedIn = entryOf(swap.workout, 'machine-shoulder-press');
    expect(swappedIn.locked).toBe(true);
    const back = run(
      { type: 'readiness', readiness: fine },
      { workout: swap.workout, constraints: swap.constraints },
    );
    const restored = entryOf(back.workout, 'machine-shoulder-press');
    expect(working(restored).length).toBe(working(swappedIn).length + 1);
    expect(working(restored)[0]!.targetRir).toBe(working(swappedIn)[0]!.targetRir - 1);
  });

  it('the lift in front keeps the sets you set by hand, and the words fit a sore day', () => {
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    const before = plan();
    const first = allEntries(before.blocks)[0]!;
    const started: CompletedWork = {
      startedAt: NOW,
      elapsedSeconds: 60,
      currentEntryId: first.id,
      sets: [],
    };
    // A set added by hand to the lift in front, then a low check-in: the count is yours, and stays.
    const added = run(
      { type: 'sets', entryId: first.id, workingDelta: 1 },
      { workout: before, completed: started, currentEntryId: first.id },
    );
    const low = run(
      { type: 'readiness', readiness: tired },
      { workout: added.workout, completed: started, currentEntryId: first.id },
    );
    expect(working(entryOf(low.workout, first.exerciseId))).toHaveLength(working(first).length + 1);
    // Sore, not low: sets cut, the reserve as it was, and the words say so.
    const sore = run({ type: 'readiness', readiness: { ...fine, soreness: 4 } });
    expect(sore.summary.headline).toMatch(/^Adjusted for today \(fewer sets\): /);
  });

  it('a lift in front with a warm-up logged is under way, and keeps its sets', () => {
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    const low = run({ type: 'readiness', readiness: tired });
    const first = allEntries(low.workout.blocks)[0]!;
    const warmup = first.sets.find((set) => set.kind === 'warmup');
    if (!warmup) throw new Error('expected a warm-up on the first lift');
    const back = run(
      { type: 'readiness', readiness: fine },
      {
        workout: low.workout,
        constraints: low.constraints,
        completed: {
          startedAt: NOW,
          elapsedSeconds: 240,
          currentEntryId: first.id,
          sets: [
            {
              entryId: first.id,
              exerciseId: first.exerciseId,
              setIndex: warmup.index,
              kind: 'warmup',
              reps: warmup.targetReps[1],
              weight: warmup.targetWeight,
              rir: warmup.targetRir,
              completedAt: NOW,
            },
          ],
        },
        currentEntryId: first.id,
      },
    );
    expect(working(entryOf(back.workout, first.exerciseId))).toEqual(working(first));
  });

  it('a check-in that changes nothing says so, and claims no cut', () => {
    // At 30 minutes the sets are already at their fewest: a sore check-in has nothing to take.
    const short = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 30,
    });
    const sore = run(
      { type: 'readiness', readiness: { ...fine, soreness: 4 } },
      { workout: short, duration: 30 },
    );
    expect(sore.summary.headline).toBe('Checked in: no changes needed.');
    // A sore knee on a day with no lift that loads it: noted, and nothing claimed for it.
    const knee = run({ type: 'readiness', readiness: { ...fine, jointDiscomfort: ['knee'] } });
    expect(knee.constraints.painJoints).toContain('knee');
    expect(knee.summary.headline).toBe('Checked in: no changes needed.');
  });

  it('a check-in back to fine with nothing left to bring back says only that', () => {
    const low = run({ type: 'readiness', readiness: tired });
    // Every lift done but the last, under way at its first working set: it keeps its sets.
    const entries = allEntries(low.workout.blocks);
    const last = entries.at(-1) as WorkoutEntry;
    const underWay = logFirstSet(low.workout, last.exerciseId);
    const done = entries.slice(0, -1).flatMap((entry) =>
      entry.sets.map((set) => ({
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: set.targetReps[1],
        weight: set.targetWeight,
        rir: set.targetRir,
        completedAt: NOW,
      })),
    );
    const back = run(
      { type: 'readiness', readiness: fine },
      {
        workout: low.workout,
        constraints: low.constraints,
        completed: { ...underWay, sets: [...done, ...underWay.sets] },
        currentEntryId: last.id,
      },
    );
    expect(back.summary.headline).toBe('Feeling good: nothing left to change.');
  });

  it('coming back after a break, an end time, the equipment and the profile keep a check-in', () => {
    const started = logFirstSet(plan(), bench);
    const lowStarted = run(
      { type: 'readiness', readiness: tired },
      { workout: plan(), completed: started },
    );
    const settings = { constraints: lowStarted.constraints, completed: started };
    const end = new Date(Date.parse(NOW) + 50 * 60_000).toISOString();
    const triggers: RecalibrationTrigger[] = [
      { type: 'resume', awaySeconds: 30 * 60 },
      { type: 'end-by', time: end },
      { type: 'equipment' },
      { type: 'profile' },
    ];
    for (const trigger of triggers) {
      const kept = run(trigger, { ...settings, workout: lowStarted.workout });
      const plain = run(trigger, { workout: plan(), completed: started });
      const shared = exerciseIds(kept.workout).filter(
        (id) => id !== bench && exerciseIds(plain.workout).includes(id),
      );
      expect(shared.length, trigger.type).toBeGreaterThanOrEqual(3);
      for (const id of shared) {
        expect(firstRir(kept.workout, id), `${trigger.type} ${id}`).toBe(
          moved(id, firstRir(plain.workout, id), 1),
        );
      }
    }
  });

  it("a lift kept through a change of place keeps a check-in's extra rep", () => {
    // The incline press is pinned, so the place change keeps it and fits it to the home weights.
    const low = run({ type: 'readiness', readiness: tired });
    const incline = 'incline-dumbbell-press';
    const pin = (workout: GeneratedWorkout) => ({
      type: 'pin' as const,
      entryId: entryOf(workout, incline).id,
      pinned: true,
    });
    const pinned = run(pin(low.workout), { workout: low.workout, constraints: low.constraints });
    const atHome = run(
      { type: 'location' },
      { workout: pinned.workout, constraints: pinned.constraints, location: home },
    );
    const before = plan();
    const plainPinned = run(pin(before), { workout: before });
    const plain = run({ type: 'location' }, { workout: plainPinned.workout, location: home });
    expect(entryOf(atHome.workout, incline).pinned).toBe(true);
    expect(firstRir(atHome.workout, incline)).toBe(
      moved(incline, firstRir(plain.workout, incline), 1),
    );
  });

  it("a check-in's own adjustment goes on top of the setting", () => {
    const before = plan();
    const harder = withIntensity('harder');
    // Harder adds a set and takes a rep of reserve; a low check-in takes a set and adds a rep.
    const both = run(
      { type: 'readiness', readiness: tired },
      { workout: harder.workout, constraints: harder.constraints },
    );
    const alone = run({ type: 'readiness', readiness: tired }, { workout: before });
    for (const id of exerciseIds(both.workout).filter((x) => exerciseIds(before).includes(x))) {
      expect(firstRir(both.workout, id)).toBe(firstRir(before, id));
    }
    expect(firstRir(alone.workout, bench)).toBe(moved(bench, firstRir(before, bench), 1));
    const working = (workout: GeneratedWorkout) =>
      entryOf(workout, bench).sets.filter((set) => set.kind === 'working').length;
    expect(working(both.workout)).toBe(working(before));
    expect(working(alone.workout)).toBe(working(before) - 1);
  });
});

describe('a lift re-targeted on its own keeps the effort it carries', () => {
  it('when the weights at the place change', () => {
    const harder = withIntensity('harder');
    const lighter: LocationProfile = {
      ...gym,
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 40, step: 5 }] } },
    };
    const refit = run(
      { type: 'loading' },
      { workout: harder.workout, constraints: harder.constraints, location: lighter },
    );
    const plain = run({ type: 'loading' }, { location: lighter });
    for (const id of exerciseIds(refit.workout)) {
      expect(firstRir(refit.workout, id)).toBe(moved(id, firstRir(plain.workout, id), -1));
    }
  });

  it('when a max is entered', () => {
    const maxes = recordMax(emptyMaxes(), bench, { kind: 'set', weight: 185, reps: 5 }, 'lb', NOW);
    const harder = withIntensity('harder');
    const fromMax = run(
      { type: 'max', exerciseId: bench },
      { workout: harder.workout, constraints: harder.constraints, maxes },
    );
    const plain = run({ type: 'max', exerciseId: bench }, { maxes });
    expect(firstRir(plain.workout, bench)).toBe(2);
    expect(firstRir(fromMax.workout, bench)).toBe(1);
    // Nearer failure, the same max asks a heavier weight.
    const weight = (workout: GeneratedWorkout) =>
      entryOf(workout, bench).sets.find((set) => set.kind === 'working')?.targetWeight ?? 0;
    expect(weight(fromMax.workout)).toBeGreaterThanOrEqual(weight(plain.workout));
  });

  it('when a lift not started is swapped', () => {
    const harder = withIntensity('harder');
    const lift = entryOf(harder.workout, bench);
    const swapped = run(
      { type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' },
      { workout: harder.workout, constraints: harder.constraints },
    );
    const plain = run({ type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' });
    const plainRir = firstRir(plain.workout, 'dumbbell-bench-press');
    expect(firstRir(swapped.workout, 'dumbbell-bench-press')).toBe(
      moved('dumbbell-bench-press', plainRir, -1),
    );
  });

  it('when a lift under way is swapped, and when it is swapped back', () => {
    const harder = withIntensity('harder');
    const lift = entryOf(harder.workout, bench);
    const completed = logFirstSet(harder.workout, bench);
    const standIn = run(
      { type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' },
      { workout: harder.workout, constraints: harder.constraints, completed },
    );
    const stand = entryOf(standIn.workout, 'dumbbell-bench-press');
    const plainStand = run(
      { type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' },
      { workout: plan(), completed: logFirstSet(plan(), bench) },
    );
    const plainRir = firstRir(plainStand.workout, 'dumbbell-bench-press');
    expect(rirOf(stand).length).toBeGreaterThan(0);
    expect(rirOf(stand)).toEqual(
      rirOf(stand).map(() => moved('dumbbell-bench-press', plainRir, -1)),
    );
    // Back to the bench press: the sets it picks up again keep Make it harder.
    const back = run(
      { type: 'replace', entryId: stand.id, exerciseId: bench },
      { workout: standIn.workout, constraints: harder.constraints, completed },
    );
    const picked = rirOf(entryOf(back.workout, bench), completed);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked).toEqual(picked.map(() => 1));
  });

  it('when a lift with only its warm-ups done is swapped', () => {
    // Stopped at its warm-ups, the lift has no working set left to read its effort from.
    const harder = withIntensity('harder');
    const lift = entryOf(harder.workout, bench);
    const warmups = lift.sets.filter((set) => set.kind === 'warmup');
    expect(warmups.length).toBeGreaterThan(0);
    const completed: CompletedWork = {
      ...logFirstSet(harder.workout, bench),
      sets: logFirstSet(harder.workout, bench).sets.filter((set) => set.kind === 'warmup'),
    };
    const standIn = run(
      { type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' },
      { workout: harder.workout, constraints: harder.constraints, completed },
    );
    const plain = run({ type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' });
    const plainRir = firstRir(plain.workout, 'dumbbell-bench-press');
    const stand = rirOf(entryOf(standIn.workout, 'dumbbell-bench-press'));
    expect(stand.length).toBeGreaterThan(0);
    expect(stand).toEqual(stand.map(() => moved('dumbbell-bench-press', plainRir, -1)));
  });

  it('when a stand-in with only a ramp set done is swapped back', () => {
    const harder = withIntensity('harder');
    const settings = { constraints: harder.constraints };
    const lift = entryOf(harder.workout, bench);
    const started = logFirstSet(harder.workout, bench);
    const swapped = run(
      { type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' },
      { ...settings, workout: harder.workout, completed: started },
    );
    const stand = entryOf(swapped.workout, 'dumbbell-bench-press');
    const ramped = run(
      { type: 'add-warmup', entryId: stand.id },
      { ...settings, workout: swapped.workout, completed: started },
    );
    const ramp = entryOf(ramped.workout, 'dumbbell-bench-press').sets.find(
      (set) => set.kind === 'warmup',
    );
    if (!ramp) throw new Error('expected a ramp set on the stand-in');
    // The ramp set is done; the stand-in stops there, with no working set left to read.
    const completed: CompletedWork = {
      ...started,
      currentEntryId: stand.id,
      sets: [
        ...started.sets,
        {
          entryId: stand.id,
          exerciseId: 'dumbbell-bench-press',
          setIndex: ramp.index,
          kind: 'warmup',
          reps: ramp.targetReps[1],
          weight: ramp.targetWeight,
          rir: ramp.targetRir,
          completedAt: NOW,
        },
      ],
    };
    const back = run(
      { type: 'replace', entryId: stand.id, exerciseId: bench },
      { ...settings, workout: ramped.workout, completed },
    );
    const picked = rirOf(entryOf(back.workout, bench), completed);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked).toEqual(picked.map(() => 1));
  });

  it('reads the effort on the set still to come, not one done before the check-in', () => {
    // The bench press's first set was planned and done before a low check-in; its sets to come
    // carry the check-in's extra rep.
    const low = run({ type: 'readiness', readiness: tired });
    const lift = entryOf(low.workout, bench);
    const first = lift.sets.find((set) => set.kind === 'working');
    if (!first) throw new Error('no working set');
    const workout: GeneratedWorkout = {
      ...low.workout,
      blocks: low.workout.blocks.map((block) => ({
        ...block,
        entries: block.entries.map((entry) =>
          entry.id !== lift.id
            ? entry
            : {
                ...entry,
                sets: entry.sets.map((set) =>
                  set === first ? { ...set, targetRir: set.targetRir - 1 } : set,
                ),
              },
        ),
      })),
    };
    const completed = logFirstSet(workout, bench);
    const standIn = run(
      { type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' },
      { workout, constraints: low.constraints, completed },
    );
    const plain = run({ type: 'replace', entryId: lift.id, exerciseId: 'dumbbell-bench-press' });
    const stand = rirOf(entryOf(standIn.workout, 'dumbbell-bench-press'));
    expect(stand.length).toBeGreaterThan(0);
    expect(stand).toEqual(
      stand.map(() =>
        moved('dumbbell-bench-press', firstRir(plain.workout, 'dumbbell-bench-press'), 1),
      ),
    );
  });

  it("keeps a check-in's extra rep in reserve through a max", () => {
    const maxes = recordMax(emptyMaxes(), bench, { kind: 'set', weight: 185, reps: 5 }, 'lb', NOW);
    const checkedIn = run({ type: 'readiness', readiness: tired });
    const fromMax = run(
      { type: 'max', exerciseId: bench },
      { workout: checkedIn.workout, constraints: checkedIn.constraints, maxes },
    );
    expect(firstRir(fromMax.workout, bench)).toBe(3);
  });
});

describe('the effort a lift carries counts as far as the day still asks it', () => {
  const constraints = (patch: Partial<SessionConstraints>): SessionConstraints => ({
    ...emptyConstraints(),
    ...patch,
  });

  it('a setting since taken back does not stay on a lift re-targeted', () => {
    const maxes = recordMax(emptyMaxes(), bench, { kind: 'set', weight: 185, reps: 5 }, 'lb', NOW);
    // Harder planned the bench press; the setting is back to plain when the max comes in.
    const harder = withIntensity('harder');
    const fromMax = run(
      { type: 'max', exerciseId: bench },
      { workout: harder.workout, constraints: constraints({ intensity: 0 }), maxes },
    );
    expect(firstRir(fromMax.workout, bench)).toBe(2);
  });

  it('a lift planned before Make it harder stays as it was when re-targeted', () => {
    const maxes = recordMax(emptyMaxes(), bench, { kind: 'set', weight: 185, reps: 5 }, 'lb', NOW);
    const fromMax = run(
      { type: 'max', exerciseId: bench },
      { workout: plan(), constraints: constraints({ intensity: 1 }), maxes },
    );
    expect(firstRir(fromMax.workout, bench)).toBe(2);
  });
});

describe('a reserve held at its limit', () => {
  it("still carries a check-in's extra rep to the exercise swapped in", () => {
    // Foundation, back to chin-ups after 45 days: the chin-up asks 4 in reserve, the most there
    // is, before and after a low check-in. The lat pulldown swapped in asks its own plain reserve
    // plus the check-in's rep.
    const foundation: UserProfile = { ...profile, programStyle: 'foundation' };
    const history = [
      record(
        45,
        'chin-up',
        [
          [8, null, 2],
          [8, null, 2],
          [7, null, 2],
        ],
        [6, 12],
      ),
    ];
    const request = (overrides: Partial<RecalibrationRequest>): RecalibrationRequest => {
      const workout =
        overrides.workout ??
        generateWorkout({
          profile: foundation,
          location: gym,
          history,
          now: RECORD_NOW,
          duration: 'default',
          constraints: { templateId: 'pull-arms' },
        });
      return {
        trigger: { type: 'profile' },
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile: foundation,
        location: gym,
        history,
        constraints: emptyConstraints(),
        reason: 'test',
        timestamp: RECORD_NOW,
        ...overrides,
      };
    };
    const go = (overrides: Partial<RecalibrationRequest>): RecalibrationSuccess => {
      const result = recalibrate(request(overrides));
      if (!result.ok) throw new Error(result.error);
      return result;
    };
    const low = go({ trigger: { type: 'readiness', readiness: tired } });
    expect(firstRir(low.workout, 'chin-up')).toBe(4);
    const swap = (from: RecalibrationSuccess, constraints: SessionConstraints) =>
      go({
        trigger: {
          type: 'replace',
          entryId: entryOf(from.workout, 'chin-up').id,
          exerciseId: 'lat-pulldown',
        },
        workout: from.workout,
        constraints,
      });
    const plainPlan = go({});
    expect(firstRir(plainPlan.workout, 'chin-up')).toBe(4);
    const plain = swap(plainPlan, emptyConstraints());
    const kept = swap(low, low.constraints);
    expect(firstRir(kept.workout, 'lat-pulldown')).toBe(
      moved('lat-pulldown', firstRir(plain.workout, 'lat-pulldown'), 1),
    );
  });
});

describe('a check-in and the sets the lifter or the fit to time set', () => {
  const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
  /** Started, nothing logged yet: the lift is in front. */
  const inFront = (entryId: string): CompletedWork => ({
    startedAt: NOW,
    elapsedSeconds: 60,
    currentEntryId: entryId,
    sets: [],
  });
  const at = (entry: WorkoutEntry) => ({
    completed: inFront(entry.id),
    currentEntryId: entry.id,
  });

  it('never raises a lift the fit trimmed, and a restore never takes a set away', () => {
    const before = plan();
    // The lift in front, trimmed by the fit to time to two working sets: no mark says so.
    const trimmed = structuredClone(before);
    const lift = allEntries(trimmed.blocks)[0]!;
    const cutOff = working(lift).slice(2);
    lift.sets = lift.sets.filter((set) => !cutOff.includes(set));
    const low = run({ type: 'readiness', readiness: tired }, { workout: trimmed, ...at(lift) });
    const lowLift = entryOf(low.workout, lift.exerciseId);
    expect(working(lowLift)).toHaveLength(2);
    expect(working(lowLift)[0]!.targetRir).toBe(
      moved(lift.exerciseId, working(lift)[0]!.targetRir, 1),
    );
    // Sore after drained: the plan asks the same sets, so the lift keeps its two.
    const sore = run(
      { type: 'readiness', readiness: { ...fine, soreness: 4 } },
      { workout: low.workout, constraints: low.constraints, ...at(lift) },
    );
    expect(working(entryOf(sore.workout, lift.exerciseId))).toHaveLength(2);
    // Back to fine with more sets than the plan asks: they stay.
    const more = structuredClone(low.workout);
    const heavy = entryOf(more, lift.exerciseId);
    const top = working(heavy).at(-1)!;
    const planned = working(entryOf(before, lift.exerciseId)).length;
    while (working(heavy).length < planned + 1) {
      heavy.sets.push({ ...top, index: Math.max(...heavy.sets.map((set) => set.index)) + 1 });
    }
    const back = run(
      { type: 'readiness', readiness: fine },
      { workout: more, constraints: low.constraints, ...at(lift) },
    );
    expect(working(entryOf(back.workout, lift.exerciseId))).toHaveLength(planned + 1);
  });

  it('keeps a set taken off by hand, on a low check-in and on the way back', () => {
    const before = plan();
    const first = allEntries(before.blocks)[0]!;
    const removed = run(
      { type: 'sets', entryId: first.id, workingDelta: -1 },
      { workout: before, ...at(first) },
    );
    const count = working(first).length - 1;
    expect(working(entryOf(removed.workout, first.exerciseId))).toHaveLength(count);
    const low = run(
      { type: 'readiness', readiness: tired },
      { workout: removed.workout, constraints: removed.constraints, ...at(first) },
    );
    expect(working(entryOf(low.workout, first.exerciseId))).toHaveLength(count);
    const back = run(
      { type: 'readiness', readiness: fine },
      { workout: low.workout, constraints: low.constraints, ...at(first) },
    );
    expect(working(entryOf(back.workout, first.exerciseId))).toHaveLength(count);
  });

  it('gives ramps past the room under the working weight no weight, as they came', () => {
    // A pinned lateral raise with two ramps added by hand: at its light weight one ramp fits under
    // it, and the other keeps no weight rather than a second of the same.
    const before = plan();
    const raise = entryOf(before, 'lateral-raise');
    const pinned = run({ type: 'pin', entryId: raise.id, pinned: true }, { workout: before });
    const once = run({ type: 'add-warmup', entryId: raise.id }, { workout: pinned.workout });
    const twice = run({ type: 'add-warmup', entryId: raise.id }, { workout: once.workout });
    const low = run(
      { type: 'readiness', readiness: tired },
      { workout: twice.workout, constraints: twice.constraints },
    );
    const lift = entryOf(low.workout, 'lateral-raise');
    const working = lift.sets.find((set) => set.kind === 'working')!.targetWeight as number;
    const weights = lift.sets.filter((set) => set.kind === 'warmup').map((set) => set.targetWeight);
    expect(weights).toHaveLength(2);
    expect(weights[0]).toBeNull();
    expect(weights[1]).toBeLessThan(working);
  });

  it('keeps a ramp set added by hand', () => {
    const before = plan();
    const first = allEntries(before.blocks)[0]!;
    const ramps = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'warmup');
    const ramped = run(
      { type: 'add-warmup', entryId: first.id },
      { workout: before, ...at(first) },
    );
    const count = ramps(entryOf(ramped.workout, first.exerciseId)).length;
    expect(count).toBe(ramps(first).length + 1);
    const low = run(
      { type: 'readiness', readiness: tired },
      { workout: ramped.workout, constraints: ramped.constraints, ...at(first) },
    );
    const lowFirst = entryOf(low.workout, first.exerciseId);
    expect(ramps(lowFirst)).toHaveLength(count);
    expect(lowFirst.warmupSets).toBe(count);
    // The check-in still reaches its working sets.
    expect(working(lowFirst)).toHaveLength(working(first).length - 1);
  });
});

describe('the words of a check-in', () => {
  const lowerDay = () =>
    generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
  const sore = (joint: Joint): Readiness => ({ ...fine, jointDiscomfort: [joint] });

  it('drained, then sore, say the planned effort came back', () => {
    const low = run({ type: 'readiness', readiness: tired });
    const soreDay = run(
      { type: 'readiness', readiness: { ...fine, soreness: 4 } },
      { workout: low.workout, constraints: low.constraints },
    );
    expect(soreDay.summary.headline).toMatch(/^Adjusted for today \(the planned effort back\): /);
  });

  it('a new length for time pressure with nothing else to change say the length', () => {
    // A usual session of 45 minutes: the plan at the usual length fits 45 already.
    const usual: UserProfile = {
      ...profile,
      schedule: { ...profile.schedule, typicalDurationMinutes: 45 },
    };
    const workout = generateWorkout({
      profile: usual,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const rushed = run(
      { type: 'readiness', readiness: { ...fine, timePressure: true } },
      { workout, profile: usual },
    );
    expect(rushed.duration).toBe(45);
    expect(rushed.summary.headline).toBe(
      'Adjusted for today (fitted to 45 min for time pressure): no changes needed.',
    );
  });

  it('claim no sets the fit to time moved on its own', () => {
    // Started at 45 minutes, a sore knee on a push day: no lift loads it, and the rebuild after
    // Start fits the minutes left, which is no part of the check-in.
    const push = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 45,
      constraints: { templateId: 'push-arms' },
    });
    const first = allEntries(push.blocks)[0]!;
    const knee = run(
      { type: 'readiness', readiness: sore('knee') },
      {
        workout: push,
        completed: { startedAt: NOW, elapsedSeconds: 60, currentEntryId: first.id, sets: [] },
        currentEntryId: first.id,
      },
    );
    expect(knee.summary.counts.adjusted).toBeGreaterThan(0);
    expect(knee.summary.headline).toMatch(/^Checked in: /);
    // The other way: at dumbbells to 30 lb a max takes the plan over, and the next rebuild trims it.
    const upTo30: LocationProfile = {
      ...home,
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 30, step: 5 }] } },
    };
    const full = generateWorkout({
      profile,
      location: upTo30,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'full-body' },
    });
    const maxes = recordMax(
      emptyMaxes(),
      'dumbbell-bench-press',
      { kind: 'max', e1rm: 110 },
      'lb',
      NOW,
    );
    const settings = { location: upTo30, maxes };
    const maxed = run(
      { type: 'max', exerciseId: 'dumbbell-bench-press' },
      { workout: full, ...settings },
    );
    const ankle = run(
      { type: 'readiness', readiness: sore('ankle') },
      { workout: maxed.workout, ...settings },
    );
    expect(ankle.summary.counts.setsTrimmed).toBeGreaterThan(0);
    expect(ankle.summary.headline).toMatch(/^Checked in: /);
  });

  it('name no joint for a lift that left for the time', () => {
    // 30 minutes of full body, the squat done and 20 minutes gone: the shoulder press leaves for
    // the time, and a sore shoulder only warns about it.
    const full = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 30,
      constraints: { templateId: 'full-body' },
    });
    const [squat, next] = allEntries(full.blocks) as [WorkoutEntry, WorkoutEntry];
    const done: CompletedWork = {
      startedAt: NOW,
      elapsedSeconds: 20 * 60,
      currentEntryId: next.id,
      sets: squat.sets.map((set) => ({
        entryId: squat.id,
        exerciseId: squat.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: set.targetReps[1],
        weight: set.targetWeight,
        rir: set.targetRir,
        completedAt: NOW,
      })),
    };
    expect(requireExercise('dumbbell-shoulder-press').jointStress.shoulder).toBe('moderate');
    const shoulder = run(
      { type: 'readiness', readiness: sore('shoulder') },
      { workout: full, completed: done, currentEntryId: next.id },
    );
    expect(exerciseIds(full)).toContain('dumbbell-shoulder-press');
    expect(exerciseIds(shoulder.workout)).not.toContain('dumbbell-shoulder-press');
    expect(shoulder.summary.headline).not.toMatch(/shoulder/);
  });

  it('count no cut for a lift a sore joint stopped, on a day at its fewest sets', () => {
    // 30 minutes of upper body, the barbell row under way: drained takes no set at 30 minutes, and
    // a sore lower back stops the row, its sets to a stand-in.
    const upper = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 30,
      constraints: { templateId: 'upper' },
    });
    const underWay = logFirstSet(upper, 'barbell-row');
    const drained = run(
      { type: 'readiness', readiness: { ...tired, jointDiscomfort: ['lower-back'] } },
      { workout: upper, completed: underWay, currentEntryId: underWay.currentEntryId },
    );
    expect(drained.summary.headline).toMatch(
      /^Adjusted for today \(an extra rep in reserve, easier on your lower back\): /,
    );
  });

  it('name a sore joint where a lift hard on it leaves', () => {
    const knee = run({ type: 'readiness', readiness: sore('knee') }, { workout: lowerDay() });
    expect(knee.summary.headline).toMatch(/^Adjusted for today \(easier on your knee\): /);
  });

  it('name it where the lift under way stops for it, and claim no cut', () => {
    // The barbell row under way loads the lower back: its sets still to come go to a stand-in.
    const upper = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'upper' },
    });
    const underWay = logFirstSet(upper, 'barbell-row');
    const back = run(
      { type: 'readiness', readiness: sore('lower-back') },
      { workout: upper, completed: underWay, currentEntryId: underWay.currentEntryId },
    );
    expect(back.summary.headline).toMatch(/^Adjusted for today \(easier on your lower back\): /);
    // A lift hard on it already done is no change.
    const row = entryOf(upper, 'barbell-row');
    const done: CompletedWork = {
      ...underWay,
      sets: row.sets.map((set) => ({
        entryId: row.id,
        exerciseId: row.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: set.targetReps[1],
        weight: set.targetWeight,
        rir: set.targetRir,
        completedAt: NOW,
      })),
    };
    const after = run(
      { type: 'readiness', readiness: sore('lower-back') },
      { workout: upper, completed: done, currentEntryId: row.id },
    );
    expect(after.summary.headline).not.toMatch(/lower back/);
  });

  it('name it where a lift leaves for the movement the joint rules out', () => {
    // The front squat puts little stress on the lower back, but a sore one rules out loading the
    // spine. With the hinge swapped for a hip thrust, it is the one lift that leaves for it.
    const lower = lowerDay();
    const squat = run(
      { type: 'replace', entryId: entryOf(lower, 'back-squat').id, exerciseId: 'front-squat' },
      { workout: lower },
    );
    const hinge = run(
      {
        type: 'replace',
        entryId: entryOf(squat.workout, 'dumbbell-romanian-deadlift').id,
        exerciseId: 'hip-thrust',
      },
      { workout: squat.workout, constraints: squat.constraints },
    );
    const back = run(
      { type: 'readiness', readiness: sore('lower-back') },
      { workout: hinge.workout, constraints: hinge.constraints },
    );
    expect(exerciseIds(back.workout)).not.toContain('front-squat');
    expect(exerciseIds(back.workout)).toContain('hip-thrust');
    expect(back.summary.headline).toMatch(/^Adjusted for today \(easier on your lower back\): /);
  });
});
