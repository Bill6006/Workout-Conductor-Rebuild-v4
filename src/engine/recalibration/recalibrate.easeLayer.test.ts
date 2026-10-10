import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import {
  PROGRAM_STYLES,
  createDefaultProfile,
  type UserProfile,
} from '../../core/validation/profile';
import {
  allEntries,
  asSaved,
  isStopped,
  roundsOf,
  roundsRun,
  withoutEase,
  type DurationChoice,
  type GeneratedWorkout,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';
import { record } from '../../test/records';
import { DUMBBELLS_KEY } from '../loading/loading';
import { loadAtMoreReserve } from '../progression/progression';
import { barWeightFor } from '../progression/startingLoad';
import { emptyMaxes, recordMax, type StrengthMaxes } from '../progression/maxes';
import { generateWorkout, mainLiftName, setFloor } from '../workoutGenerator/generate';
import { MAX_WORKING_SETS, emptyConstraints, planUnderTheEase, recalibrate } from './recalibrate';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type {
  CompletedWork,
  Readiness,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';

/**
 * Maintenance 26, the sixth pass of the owner's item 42 (docs/research/bad-start.md): a hard
 * start's ease is a layer over the plan. Every change is made to the plan under it and the ease is
 * laid again over what the change leaves, so a rebuild neither loses it nor eases a lift twice; a
 * set comes off only above the floor a check-in keeps; each set left takes a rep more in reserve,
 * never heavier; and the plan comes back exactly as it was when the start no longer falls short.
 */

const NOW = '2026-10-09T14:00:00.000Z';
const places = createDefaultLocations({ gymAccess: true }, NOW);
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const home = places.find((place) => place.id === 'home') as LocationProfile;
const base: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
/** A gym whose dumbbells stop at 15 lb: heavier asks are pushed to their reserve there. */
const light: LocationProfile = {
  ...gym,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 15, step: 5 }] } },
};

const tired: Readiness = {
  energy: 2,
  soreness: 3,
  sleep: 2,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};
const fine: Readiness = { ...tired, energy: 4, sleep: 4, motivation: 4, soreness: 2 };
const sore: Readiness = { ...fine, soreness: 4 };

interface Session {
  profile: UserProfile;
  location: LocationProfile;
  workout: GeneratedWorkout;
  constraints: SessionConstraints;
  completed: CompletedWork;
  duration: DurationChoice;
  history: WorkoutRecord[];
  maxes?: StrengthMaxes;
  result?: RecalibrationSuccess;
}

function run(session: Session, trigger: RecalibrationTrigger): Session {
  const result = recalibrate({
    trigger,
    workout: session.workout,
    completed: session.completed,
    lockedEntryIds: [],
    currentEntryId: session.completed.currentEntryId,
    duration: session.duration,
    profile: session.profile,
    location: session.location,
    history: session.history,
    constraints: session.constraints,
    reason: 'test',
    timestamp: NOW,
    ...(session.maxes ? { maxes: session.maxes } : {}),
  });
  if (!result.ok) throw new Error(result.error);
  return {
    ...session,
    workout: result.workout,
    constraints: result.constraints,
    duration: result.duration,
    result,
  };
}

/** A session under way: the first lift's ramps and its first working set logged at its targets. */
function underWay(
  profile: UserProfile,
  location: LocationProfile,
  duration: DurationChoice,
  constraints: SessionConstraints = emptyConstraints(),
  history: WorkoutRecord[] = [],
): Session {
  const workout = generateWorkout({
    profile,
    location,
    history,
    now: NOW,
    duration,
    constraints: { deload: constraints.deload },
  });
  const entry = allEntries(workout.blocks)[0] as WorkoutEntry;
  const first = entry.sets.find((set) => set.kind === 'working');
  if (!first) throw new Error('no working set');
  return {
    profile,
    location,
    workout,
    duration,
    constraints,
    history,
    completed: {
      startedAt: NOW,
      elapsedSeconds: 6 * 60,
      currentEntryId: entry.id,
      sets: entry.sets
        .filter((set) => set.index <= first.index)
        .map((set) => ({
          entryId: entry.id,
          exerciseId: entry.exerciseId,
          setIndex: set.index,
          kind: set.kind,
          reps: set.targetReps[0],
          weight: set.targetWeight,
          rir: set.targetRir,
          completedAt: NOW,
        })),
    },
  };
}

const lifts = (session: Session) =>
  allEntries(session.workout.blocks)
    .slice(0, 2)
    .map((entry) => entry.exerciseId);
const hardStart = (session: Session) =>
  run(session, { type: 'bad-start', low: true, lifts: lifts(session) });
const backToPlan = (session: Session) =>
  run(session, { type: 'bad-start', low: false, lifts: lifts(session) });

/** The lifts in blocks with nothing logged. */
function toCome(session: Session): WorkoutEntry[] {
  const begun = new Set(session.completed.sets.map((set) => set.entryId));
  return session.workout.blocks
    .filter((block) => !block.entries.some((entry) => begun.has(entry.id)))
    .flatMap((block) => block.entries);
}
const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
const entryIn = (session: Session, test: (entry: WorkoutEntry) => boolean): WorkoutEntry => {
  const found = allEntries(session.workout.blocks).find(test);
  if (!found) throw new Error('no such lift');
  return found;
};
/** A lift begun: its ramps skipped, or else its first working set. */
function begin(at: Session, id: string): Session {
  const entry = allEntries(at.workout.blocks).find((candidate) => candidate.id === id)!;
  const ramps = entry.sets.filter((set) => set.kind === 'warmup');
  const done =
    ramps.length > 0 ? ramps : entry.sets.filter((set) => set.kind === 'working').slice(0, 1);
  return {
    ...at,
    completed: {
      ...at.completed,
      sets: [
        ...at.completed.sets,
        ...done.map((set) => ({
          entryId: entry.id,
          exerciseId: entry.exerciseId,
          setIndex: set.index,
          kind: set.kind,
          reps: 0,
          weight: null,
          rir: null,
          completedAt: NOW,
          skipped: true,
        })),
      ],
    },
  };
}

/** The blocks as they show, a hard start's marks aside. */
const shown = (workout: GeneratedWorkout): WorkoutBlock[] => withoutEase(workout).blocks;

const STYLES = PROGRAM_STYLES.filter((style) => style !== 'auto');
const LENGTHS: DurationChoice[] = [15, 30, 45, 'default'];

describe('a hard start laid over the plan (Maintenance 26, the sixth pass of item 42)', () => {
  it('eases every lift still to come, never heavier nor under the floor, and gives the plan back exactly', () => {
    const paths = { lighter: 0, fewerReps: 0, kept: 0, setsTaken: 0, lifts: 0, unequal: 0 };
    for (const style of STYLES) {
      for (const location of [gym, home]) {
        for (const duration of LENGTHS) {
          const session = underWay({ ...base, programStyle: style }, location, duration);
          const eased = hardStart(session);
          for (const at of [session, eased]) {
            for (const block of at.workout.blocks) {
              if (block.kind === 'superset') {
                expect(block.rounds).toBe(Math.max(...block.entries.map(roundsOf)));
                if (roundsOf(block.entries[0]!) !== roundsOf(block.entries[1]!)) paths.unequal += 1;
              }
            }
          }
          const before = new Map(toCome(session).map((entry) => [entry.id, entry]));
          expect([...toCome(eased).map((entry) => entry.id)]).toEqual([...before.keys()]);
          for (const entry of toCome(eased)) {
            const was = before.get(entry.id) as WorkoutEntry;
            const hold = requireExercise(entry.exerciseId).measure === 'seconds';
            const [plan, now] = [working(was), working(entry)];
            // A set fewer above the floor a check-in keeps, and never under it.
            const floor = setFloor(entry.role);
            expect(now).toHaveLength(plan.length > floor ? plan.length - 1 : plan.length);
            if (now.length < plan.length) paths.setsTaken += 1;
            now.forEach((set, at) => {
              const asked = plan[at]!;
              expect(set.targetWeight ?? 0).toBeLessThanOrEqual(asked.targetWeight ?? 0);
              if (hold || asked.targetRir >= 4) {
                expect(set).toEqual(asked);
                paths.kept += 1;
                return;
              }
              // A rep more in reserve: a lighter load at the same reps, or a rep fewer at the same.
              expect(set.targetRir).toBe(asked.targetRir + 1);
              if (set.targetWeight === asked.targetWeight) {
                expect(set.targetReps).toEqual([
                  Math.max(1, asked.targetReps[0] - 1),
                  asked.targetReps[1] - 1,
                ]);
                paths.fewerReps += 1;
              } else {
                expect(set.targetReps).toEqual(asked.targetReps);
                paths.lighter += 1;
              }
            });
            paths.lifts += 1;
          }
          // The start no longer falls short: the plan exactly as it was.
          expect(shown(backToPlan(eased).workout)).toEqual(session.workout.blocks);
        }
      }
    }
    // With nothing logged, most sets run to twelve reps and reserve or more, where the plan's own
    // rule moves no load: a rep comes off. The lighter loads are read with history below.
    expect(paths.lifts).toBeGreaterThan(150);
    expect(paths.setsTaken).toBeGreaterThan(20);
    expect(paths.lighter).toBeGreaterThan(0);
    expect(paths.fewerReps).toBeGreaterThan(20);
    expect(paths.unequal).toBeGreaterThan(0);
  });

  it("takes a heavy set to the load nearest the plan's own rule for the reserve, its reps kept", () => {
    // A heavy lifter's last sessions, a few days back: strength sets on the main lifts.
    const history = (['back-squat', 'barbell-bench-press', 'barbell-row', 'deadlift'] as const).map(
      (id, at) => {
        const when = new Date(Date.parse(NOW) - (2 + at) * 86_400_000).toISOString();
        return {
          ...record(2 + at, id, [
            [5, 225, 2],
            [5, 225, 2],
            [5, 225, 2],
          ]),
          id: `w-heavy-${id}`,
          startedAt: when,
          completedAt: when,
        };
      },
    );
    let lighter = 0;
    let pushed = 0;
    for (const [style, location] of [
      ['strength-focus', gym],
      ['hybrid', gym],
      ['undulating', gym],
      ['strength-focus', light],
      ['hybrid', light],
    ] as const) {
      const session = underWay(
        { ...base, programStyle: style },
        location,
        'default',
        emptyConstraints(),
        history,
      );
      const eased = hardStart(session);
      const before = new Map(toCome(session).map((entry) => [entry.id, entry]));
      for (const entry of toCome(eased)) {
        for (const [at, set] of working(entry).entries()) {
          const asked = working(before.get(entry.id)!)[at]!;
          // A set the weights here pushed keeps its load: they make nothing nearer its ask.
          if (asked.asked) {
            expect(set.targetWeight).toBe(asked.targetWeight);
            pushed += 1;
          }
          if (set.targetWeight === asked.targetWeight) continue;
          lighter += 1;
          expect(set.targetReps).toEqual(asked.targetReps);
          expect(set.targetRir).toBe(asked.targetRir + 1);
          // Nearer the load the plan's rule gives a rep more in reserve than the plan's own.
          const exact = loadAtMoreReserve(
            asked.targetWeight as number,
            asked.targetReps[1],
            asked.targetRir,
            1,
          );
          expect(Math.abs((set.targetWeight as number) - exact)).toBeLessThan(
            Math.abs((asked.targetWeight as number) - exact),
          );
          // About a rep lighter, a load step at most past it: never a cut the rule does not ask.
          expect((asked.targetWeight as number) - (set.targetWeight as number)).toBeLessThanOrEqual(
            (asked.targetWeight as number) * 0.04 + 5,
          );
        }
      }
      expect(shown(backToPlan(eased).workout)).toEqual(session.workout.blocks);
    }
    expect(lighter).toBeGreaterThan(3);
    expect(pushed).toBeGreaterThan(0);
  });

  it('lays the ease over a deload week: a reserve at four stays, and the plan comes back', () => {
    const deload = { startsAt: '2026-10-05T00:00:00.000Z', endsAt: '2026-10-12T00:00:00.000Z' };
    const session = underWay(base, gym, 'default', { ...emptyConstraints(), deload });
    const eased = hardStart(session);
    const before = new Map(toCome(session).map((entry) => [entry.id, entry]));
    for (const entry of toCome(eased)) {
      for (const [at, set] of working(entry).entries()) {
        const asked = working(before.get(entry.id)!)[at]!;
        expect(set.targetRir).toBe(Math.min(4, asked.targetRir + 1));
        expect(set.targetRir).toBeLessThanOrEqual(4);
      }
    }
    expect(shown(backToPlan(eased).workout)).toEqual(session.workout.blocks);
  });

  it('after a rebuild lays the ease once over the plan the rebuild made, and gives that plan back', () => {
    for (const choice of [45, 30] as const) {
      const session = underWay(base, gym, 'default');
      const eased = hardStart(session);
      const shorter = run(eased, { type: 'duration', choice });
      const plain = run(session, { type: 'duration', choice });
      // Each lift still to come eased once over the plan the change made: a set at most.
      const made = new Map(toCome(plain).map((entry) => [entry.id, entry]));
      for (const entry of toCome(shorter)) {
        const was = working(made.get(entry.id)!).length;
        expect(working(entry).length).toBeGreaterThanOrEqual(was - 1);
      }
      expect(shown(backToPlan(shorter).workout)).toEqual(plain.workout.blocks);
      // The hard start read again finds its ease laid already: nothing more comes off.
      expect(hardStart(shorter).workout.blocks).toEqual(shorter.workout.blocks);
      // An undo after it and the same short sets again ease it once, not twice.
      expect(hardStart(backToPlan(shorter)).workout.blocks).toEqual(shorter.workout.blocks);
    }
  });

  it('after a pause and after an end time, the plan comes back as the rebuild made it, the time kept', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const later = { ...eased, completed: { ...eased.completed, elapsedSeconds: 20 * 60 } };
    const resumed = run(later, { type: 'resume', awaySeconds: 25 * 60 });
    const plainResumed = run(
      { ...session, completed: later.completed },
      { type: 'resume', awaySeconds: 25 * 60 },
    );
    expect(shown(backToPlan(resumed).workout)).toEqual(plainResumed.workout.blocks);
    const time = new Date(Date.parse(NOW) + 30 * 60_000).toISOString();
    const capped = run(eased, { type: 'end-by', time });
    const back = backToPlan(capped);
    expect(shown(back.workout)).toEqual(run(session, { type: 'end-by', time }).workout.blocks);
    expect(back.workout.compromises.join(' ')).not.toMatch(/Runs about/);
  });

  it('takes no second set after a sore check-in: the larger of each part, never both', () => {
    const session = underWay(base, gym, 'default');
    const sorer = run(session, { type: 'readiness', readiness: sore });
    const eased = hardStart(sorer);
    const before = new Map(toCome(sorer).map((entry) => [entry.id, entry]));
    for (const entry of toCome(eased)) {
      expect(working(entry)).toHaveLength(working(before.get(entry.id)!).length);
    }
    expect(eased.result!.summary.headline).toMatch(/an extra rep in reserve/);
    expect(eased.result!.summary.headline).not.toMatch(/fewer sets/);
    // The other way round, the same plan: the check-in after the hard start.
    expect(shown(run(hardStart(session), { type: 'readiness', readiness: sore }).workout)).toEqual(
      shown(eased.workout),
    );
    // A sore knee checked in after it: the words say what changed as it shows, no set or rep.
    const knee = run(hardStart(session), {
      type: 'readiness',
      readiness: { ...sore, jointDiscomfort: ['knee'] },
    });
    expect(knee.result!.summary.headline).not.toMatch(/fewer sets|extra rep/);
  });

  it('adds nothing to a low check-in, nor a low check-in to it: the plan a low check-in makes', () => {
    for (const duration of [30, 'default'] as const) {
      const session = underWay(base, gym, duration);
      const low = run(session, { type: 'readiness', readiness: tired });
      const both = run(hardStart(session), { type: 'readiness', readiness: tired });
      expect(shown(both.workout)).toEqual(low.workout.blocks);
      expect(hardStart(low).workout.blocks).toEqual(low.workout.blocks);
    }
  });

  it('counts sets added or taken by hand from what shows; the count stays when the ease comes off', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find((entry) => working(entry).length >= 2)!;
    const shownCount = working(lift).length;
    const fewer = run(eased, { type: 'sets', entryId: lift.id, workingDelta: -1 });
    expect(working(entryIn(fewer, (entry) => entry.id === lift.id))).toHaveLength(shownCount - 1);
    const back = backToPlan(fewer);
    const kept = entryIn(back, (entry) => entry.id === lift.id);
    expect(working(kept)).toHaveLength(shownCount - 1);
    // The plan's own reserve and loads come back on the sets kept.
    const plan = working(entryIn(session, (entry) => entry.id === lift.id));
    expect(working(kept)).toEqual(plan.slice(0, shownCount - 1));
    let many = eased;
    for (let tap = 0; tap < MAX_WORKING_SETS + 2; tap += 1) {
      many = run(many, { type: 'sets', entryId: lift.id, workingDelta: 1 });
    }
    expect(working(entryIn(many, (entry) => entry.id === lift.id))).toHaveLength(MAX_WORKING_SETS);
    expect(working(entryIn(backToPlan(many), (entry) => entry.id === lift.id))).toHaveLength(
      MAX_WORKING_SETS,
    );
  });

  it("eases a lift the coach adds during it: the coach's sets, a rep more in reserve, given back", () => {
    const session = underWay(base, gym, 'default');
    const add: RecalibrationTrigger = {
      type: 'add-exercise',
      exerciseId: 'leg-extension',
      muscle: 'quads',
      sets: 2,
    };
    const plain = entryIn(run(session, add), (entry) => entry.exerciseId === 'leg-extension');
    const added = run(hardStart(session), add);
    const eased = entryIn(added, (entry) => entry.exerciseId === 'leg-extension');
    expect(working(eased)).toHaveLength(2);
    expect(working(eased).map((set) => set.targetRir)).toEqual(
      working(plain).map((set) => Math.min(4, set.targetRir + 1)),
    );
    const back = entryIn(backToPlan(added), (entry) => entry.exerciseId === 'leg-extension');
    expect(back.sets).toEqual(plain.sets);
  });

  it('keeps marks off a saved copy, and a mark left with no hard start gives its lift back', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    expect(allEntries(eased.workout.blocks).some((entry) => entry.eased)).toBe(true);
    expect(allEntries(withoutEase(eased.workout).blocks).some((entry) => entry.eased)).toBe(false);
    expect(allEntries(asSaved(eased.workout).blocks).some((entry) => entry.eased)).toBe(false);
    // A mark with no hard start in force (a lift begun when the ease came off, its set undone):
    // the next change gives the lift back.
    const stray = run(
      { ...eased, constraints: emptyConstraints() },
      { type: 'pin', entryId: toCome(eased)[0]!.id, pinned: true },
    );
    for (const entry of toCome(stray)) expect(entry.eased).toBeUndefined();
    expect(working(toCome(stray)[1]!)).toEqual(working(toCome(session)[1]!));
  });

  it("counts a block's rounds by its working sets, a drop set apart, eased and given back", () => {
    const session = underWay(base, gym, 'default');
    const pair = session.workout.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        !block.entries.some((entry) => session.completed.sets.some((s) => s.entryId === entry.id)),
    );
    if (!pair) throw new Error('no superset to come');
    const second = pair.entries[1]!;
    const dropped = run(session, { type: 'drop-set', entryId: second.id, on: true });
    const block = (at: Session) => at.workout.blocks.find((candidate) => candidate.id === pair.id)!;
    const rounds = (at: Session) =>
      Math.min(...block(at).entries.map((entry) => working(entry).length));
    expect(block(dropped).rounds).toBe(rounds(dropped));
    const eased = hardStart(dropped);
    expect(block(eased).rounds).toBe(rounds(eased));
    expect(shown(backToPlan(eased).workout)).toEqual(dropped.workout.blocks);
  });

  it('says why on an eased lift, and the give-back says what came back', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        entry.progression !== undefined &&
        requireExercise(entry.exerciseId).measure !== 'seconds' &&
        working(entry).length < entry.eased.sets!.filter((set) => set.kind === 'working').length,
    )!;
    expect(lift.progression!.evidence[0]).toBe(
      'Eased for a hard start: a set fewer and a rep more in reserve.',
    );
    const back = backToPlan(eased);
    expect(back.result!.summary.headline).toMatch(
      /^Back to plan \(the planned sets and effort back\)/,
    );
    // The time says what the plan holds: shorter eased, the plan's own given back.
    expect(eased.workout.duration.estimatedMinutes).toBeLessThan(
      back.workout.duration.estimatedMinutes,
    );
  });

  it('counts a short warm-up after a pause in the time once eased', () => {
    const session = underWay(base, gym, 'default');
    const later = (at: Session) => ({
      ...at,
      completed: { ...at.completed, elapsedSeconds: 20 * 60 },
    });
    const resumed = run(later(hardStart(session)), { type: 'resume', awaySeconds: 25 * 60 });
    const plain = run(later(session), { type: 'resume', awaySeconds: 25 * 60 });
    expect(plain.workout.explanation.time.warmupMinutes).toBeGreaterThan(0);
    expect(resumed.workout.explanation.time.warmupMinutes).toBe(
      plain.workout.explanation.time.warmupMinutes,
    );
  });

  it('leaves a lift begun after the ease as it is through a change and the give-back; undone, it is the plan again', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find((entry) => entry.eased !== undefined)!;
    const set = working(lift)[0]!;
    const begun: Session = {
      ...eased,
      completed: {
        ...eased.completed,
        sets: [
          ...eased.completed.sets,
          {
            entryId: lift.id,
            exerciseId: lift.exerciseId,
            setIndex: set.index,
            kind: 'working',
            reps: set.targetReps[0],
            weight: set.targetWeight,
            rir: set.targetRir,
            completedAt: NOW,
          },
        ],
      },
    };
    const same = (at: Session) => working(entryIn(at, (entry) => entry.id === lift.id));
    const pinned = run(begun, { type: 'pin', entryId: lift.id, pinned: true });
    expect(same(pinned)).toEqual(working(lift));
    const back = backToPlan(pinned);
    expect(same(back)).toEqual(working(lift));
    // Its set undone, it keeps the ease for good (the eighth pass): the next change leaves it.
    const undone = run(
      { ...back, completed: eased.completed },
      { type: 'pin', entryId: lift.id, pinned: false },
    );
    expect(same(undone)).toEqual(working(lift));
  });

  it('keeps a weight set by hand on its load, reps set by hand on their reps, and a single its rep', () => {
    const history = (['back-squat', 'barbell-bench-press', 'barbell-row', 'deadlift'] as const).map(
      (id, at) => {
        const when = new Date(Date.parse(NOW) - (2 + at) * 86_400_000).toISOString();
        return {
          ...record(2 + at, id, [
            [5, 225, 2],
            [5, 225, 2],
          ]),
          id: `w-hand-${id}`,
          startedAt: when,
          completedAt: when,
        };
      },
    );
    const session = underWay(
      { ...base, programStyle: 'strength-focus' },
      gym,
      'default',
      emptyConstraints(),
      history,
    );
    // A lift the hard start alone takes to a lighter load.
    const alone = hardStart(session);
    const plan = (id: string) => working(entryIn(session, (entry) => entry.id === id));
    const lift = toCome(alone).find((entry) =>
      working(entry).some((set, at) => set.targetWeight !== plan(entry.id)[at]!.targetWeight),
    )!;
    const asked = plan(lift.id)[0]!;
    // Its weight set by hand: the load stays, a rep comes off.
    const weighed = run(session, {
      type: 'target-weight',
      entryId: lift.id,
      weight: asked.targetWeight,
    });
    const byWeight = working(entryIn(hardStart(weighed), (entry) => entry.id === lift.id));
    const weighedSets = working(entryIn(weighed, (entry) => entry.id === lift.id));
    byWeight.forEach((set, at) => {
      expect(set.targetWeight).toBe(weighedSets[at]!.targetWeight);
      expect(set.targetReps[1]).toBe(weighedSets[at]!.targetReps[1] - 1);
    });
    // Its reps set by hand: they stay, and the load comes down where the place makes one near.
    const repped = run(session, {
      type: 'rep-range',
      entryId: lift.id,
      reps: [asked.targetReps[0], asked.targetReps[1]],
    });
    const repSets = working(entryIn(repped, (entry) => entry.id === lift.id));
    const byReps = working(entryIn(hardStart(repped), (entry) => entry.id === lift.id));
    byReps.forEach((set, at) => {
      expect(set.targetReps).toEqual(repSets[at]!.targetReps);
      expect(set.targetWeight ?? 0).toBeLessThanOrEqual(repSets[at]!.targetWeight ?? 0);
    });
    // A single at bodyweight cannot lose its rep: it stays as it was.
    const single = structuredClone(session);
    const bodyweight = toCome(single).find((entry) => entry.id !== lift.id)!;
    for (const one of working(bodyweight)) {
      one.targetReps = [1, 1];
      one.targetWeight = null;
      delete one.asked;
    }
    const kept = working(entryIn(hardStart(single), (entry) => entry.id === bodyweight.id));
    for (const one of kept) {
      expect(one.targetReps).toEqual([1, 1]);
      expect(one.targetWeight).toBeNull();
    }
  });

  it("keeps a hold's seconds and load, and a reserve already at four, as they are", () => {
    const session = structuredClone(underWay(base, gym, 'default'));
    const [carry, easy] = toCome(session).filter((entry) => working(entry).length > 0);
    // One lift to come made a farmer carry held for seconds, another asked at four in reserve.
    carry!.exerciseId = 'farmer-carry';
    for (const set of working(carry!)) set.targetReps = [30, 40];
    for (const set of working(easy!)) set.targetRir = 4;
    const eased = hardStart(session);
    const kept = (lift: WorkoutEntry) =>
      working(entryIn(eased, (entry) => entry.id === lift.id)).map((set, at) => [
        set,
        working(lift)[at],
      ]);
    for (const [now, was] of [...kept(carry!), ...kept(easy!)]) expect(now).toEqual(was);
  });

  it('takes no set a check-in took on a day made harder: a lift above the floor keeps its count', () => {
    const harder = run(underWay(base, gym, 'default'), { type: 'intensity', direction: 'harder' });
    const sorer = run(harder, { type: 'readiness', readiness: sore });
    // Made harder, then sore: lifts sit above the floor, so a second set could still come off.
    expect(toCome(sorer).some((entry) => working(entry).length > setFloor(entry.role))).toBe(true);
    const eased = hardStart(sorer);
    const before = new Map(toCome(sorer).map((entry) => [entry.id, entry]));
    for (const entry of toCome(eased)) {
      expect(working(entry)).toHaveLength(working(before.get(entry.id)!).length);
    }
  });

  it('keeps a pushed set on its load where a lighter one would be nearer: a rep comes off', () => {
    const session = structuredClone(underWay(base, gym, 'default'));
    const barbell = toCome(session).find(
      (entry) =>
        barWeightFor(requireExercise(entry.exerciseId), 'lb') !== null &&
        requireExercise(entry.exerciseId).measure !== 'seconds',
    )!;
    // Pushed at the place: 100 lb stands in for 110, two to three reps, one in reserve. The rule
    // for a rep more in reserve reads about 97 lb, nearer 95 than 100.
    for (const set of working(barbell)) {
      set.targetWeight = 100;
      set.targetReps = [2, 3];
      set.targetRir = 1;
      set.asked = { weight: 110, reps: [2, 3] };
    }
    expect(loadAtMoreReserve(100, 3, 1, 1)).toBeLessThan(97.5);
    const eased = working(entryIn(hardStart(session), (entry) => entry.id === barbell.id));
    for (const set of eased) {
      expect(set.targetWeight).toBe(100);
      expect(set.targetReps).toEqual([1, 2]);
      expect(set.targetRir).toBe(2);
    }
  });

  it('keeps reps set by hand on a set no lighter load answers: its reps and reserve stay', () => {
    const session = underWay(base, gym, 'default');
    const lift = toCome(session).find(
      (entry) =>
        requireExercise(entry.exerciseId).measure !== 'seconds' &&
        working(entry).some((set) => (set.targetWeight ?? 0) > 0),
    )!;
    // Fifteen at the top: the plan's rule reads no lighter load past twelve reps and reserve.
    const repped = run(session, { type: 'rep-range', entryId: lift.id, reps: [12, 15] });
    const handSets = working(entryIn(repped, (entry) => entry.id === lift.id));
    expect(handSets.every((set) => set.targetReps[1] === 15)).toBe(true);
    const eased = working(entryIn(hardStart(repped), (entry) => entry.id === lift.id));
    eased.forEach((set, at) => {
      expect(set.targetReps).toEqual(handSets[at]!.targetReps);
      expect(set.targetRir).toBe(handSets[at]!.targetRir);
    });
  });

  it('never takes the last working set by hand', () => {
    let session = underWay(base, gym, 'default');
    const lift = toCome(session).find((entry) => working(entry).length >= 2)!;
    const count = () => working(entryIn(session, (entry) => entry.id === lift.id)).length;
    while (count() > 1)
      session = run(session, { type: 'sets', entryId: lift.id, workingDelta: -1 });
    const last = run(session, { type: 'sets', entryId: lift.id, workingDelta: -1 });
    expect(last.result!.summary.headline).toMatch(/keeps its last working set\.$/);
    expect(working(entryIn(last, (entry) => entry.id === lift.id))).toHaveLength(1);
  });

  it('says the minutes a skip saves as the plan shows them, eased or given back', () => {
    const session = underWay(base, gym, 'default');
    for (const at of [hardStart(session), backToPlan(hardStart(session))]) {
      const lift = toCome(at).find((entry) => working(entry).length > 0)!;
      const skipped = run(at, { type: 'skip', entryId: lift.id });
      const said = /about (\d+) min saved/.exec(skipped.result!.summary.headline);
      const minutes = Number(said![1]);
      expect(minutes).toBeGreaterThan(0);
      const fell = at.workout.duration.estimatedMinutes - skipped.workout.duration.estimatedMinutes;
      expect(Math.abs(minutes - fell)).toBeLessThanOrEqual(1);
    }
  });

  it('gives a stand-in for a lift begun during the ease what the lift showed still to come, for good', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        working(entry).length < entry.eased.sets!.filter((set) => set.kind === 'working').length,
    )!;
    /** The lift begun: its ramps skipped, or else its first working set. */
    const begin = (at: Session): Session => {
      const entry = entryIn(at, (candidate) => candidate.id === lift.id);
      const ramps = entry.sets.filter((set) => set.kind === 'warmup');
      const done = ramps.length > 0 ? ramps : working(entry).slice(0, 1);
      return {
        ...at,
        completed: {
          ...at.completed,
          sets: [
            ...at.completed.sets,
            ...done.map((set) => ({
              entryId: entry.id,
              exerciseId: entry.exerciseId,
              setIndex: set.index,
              kind: set.kind,
              reps: 0,
              weight: null,
              rir: null,
              completedAt: NOW,
              skipped: true,
            })),
          ],
        },
      };
    };
    const standIn = (at: Session) =>
      working(
        entryIn(at, (entry) => entry.replacedFrom === lift.exerciseId && entry.id !== lift.id),
      );
    const plain = run(begin(session), { type: 'uncomfortable', entryId: lift.id });
    const begun = begin(eased);
    const swapped = run(begun, { type: 'uncomfortable', entryId: lift.id });
    const done = begun.completed.sets.filter(
      (set) => set.entryId === lift.id && set.kind === 'working',
    ).length;
    const left = working(lift).length - done;
    // The count the ease left, taken no further (the ninth pass: owed the plan's, it gave back the
    // set the ease took), with the ease's reserve.
    const [stand, plan] = [standIn(swapped), standIn(plain)];
    expect(stand).toHaveLength(left);
    expect(left).toBeLessThan(plan.length);
    expect(stand[0]!.targetRir).toBe(Math.min(4, plan[0]!.targetRir + 1));
    // Back to plan gives its effort back, never a set: the lift was under way.
    const back = standIn(backToPlan(swapped));
    expect(back).toHaveLength(left);
    expect(back[0]!.targetRir).toBe(plan[0]!.targetRir);
  });

  it('keeps no record of an exercise swapped away in a pair under way, nor one of another exercise', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const pair = eased.workout.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        block.entries.every((entry) => entry.eased !== undefined) &&
        !block.entries.some((entry) => eased.completed.sets.some((s) => s.entryId === entry.id)),
    );
    if (!pair) throw new Error('no eased superset to come');
    const [first, second] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const set = working(first)[0]!;
    // The pair under way: its first member's first set logged.
    const under: Session = {
      ...eased,
      completed: {
        ...eased.completed,
        sets: [
          ...eased.completed.sets,
          {
            entryId: first.id,
            exerciseId: first.exerciseId,
            setIndex: set.index,
            kind: 'working',
            reps: set.targetReps[0],
            weight: set.targetWeight,
            rir: set.targetRir,
            completedAt: NOW,
          },
        ],
      },
    };
    const swapped = run(under, { type: 'uncomfortable', entryId: second.id });
    const member = entryIn(swapped, (entry) => entry.id === second.id);
    expect(member.exerciseId).not.toBe(second.exerciseId);
    // No record of the old exercise: a record it has is of what came in, the plan's count of it
    // kept for a saved copy (the thirteenth pass).
    expect(member.eased?.exerciseId).toBe(member.exerciseId);
    expect(member.eased?.kept).toBe(true);
    // A record left on another exercise is none of this one's: it goes, the lift as it is.
    const stale = structuredClone(eased);
    const lift = toCome(stale).find((entry) => entry.eased !== undefined)!;
    lift.eased!.exerciseId = 'another-exercise';
    const back = entryIn(backToPlan(stale), (entry) => entry.id === lift.id);
    expect(back.eased).toBeUndefined();
    expect(back.sets).toEqual(lift.sets);
  });

  it("counts every block's rounds by its working sets after any change: a drop set is no round", () => {
    const session = underWay(base, gym, 'default');
    const pair = session.workout.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        !block.entries.some((entry) => session.completed.sets.some((s) => s.entryId === entry.id)),
    )!;
    const straight = toCome(session).find(
      (entry) =>
        requireExercise(entry.exerciseId).dropSetSafe &&
        session.workout.blocks.some(
          (block) => block.kind === 'straight' && block.entries[0]!.id === entry.id,
        ),
    )!;
    let at = run(session, { type: 'drop-set', entryId: pair.entries[1]!.id, on: true });
    at = run(at, { type: 'drop-set', entryId: straight.id, on: true });
    at = run(at, { type: 'pin', entryId: straight.id, pinned: true });
    const check = (where: Session) => {
      for (const block of where.workout.blocks) {
        if (block.kind === 'circuit') continue;
        // A pair runs its longer member's rounds (the eighth pass).
        expect(block.rounds).toBe(Math.max(...block.entries.map(roundsOf)));
      }
    };
    for (const choice of [45, 30] as const) check(run(at, { type: 'duration', choice }));
    check(run(at, { type: 'split-superset', blockId: pair.id }));
    check(run(at, { type: 'skip', entryId: pair.entries[0]!.id }));
    check(hardStart(at));
  });

  it('adds one set to what shows for fewer reps over more sets', () => {
    const eased = hardStart(underWay(base, gym, 'default'));
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        requireExercise(entry.exerciseId).measure !== 'seconds' &&
        working(entry).length < entry.eased.sets!.filter((set) => set.kind === 'working').length,
    )!;
    const shownCount = working(lift).length;
    const [low, high] = working(lift)[0]!.targetReps;
    const more = run(eased, {
      type: 'rep-range',
      entryId: lift.id,
      reps: [Math.max(1, low - 2), Math.max(1, high - 2)],
      workingDelta: 1,
    });
    expect(working(entryIn(more, (entry) => entry.id === lift.id))).toHaveLength(shownCount + 1);
  });

  it('keeps the sets the coach offered through a pin and an unpin', () => {
    const session = underWay(base, gym, 'default');
    const added = run(session, {
      type: 'add-exercise',
      exerciseId: 'leg-extension',
      muscle: 'quads',
      sets: 3,
    });
    const lift = entryIn(added, (entry) => entry.exerciseId === 'leg-extension');
    const pinned = run(added, { type: 'pin', entryId: lift.id, pinned: true });
    const unpinned = run(pinned, { type: 'pin', entryId: lift.id, pinned: false });
    const eased = hardStart(unpinned);
    expect(working(entryIn(eased, (entry) => entry.id === lift.id))).toHaveLength(3);
  });

  it('owes a new place what a lift begun during the ease showed still to come', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        barWeightFor(requireExercise(entry.exerciseId), 'lb') !== null &&
        working(entry).length < entry.eased.sets!.filter((set) => set.kind === 'working').length,
    )!;
    const moved = (at: Session) =>
      run({ ...begin(at, lift.id), location: home }, { type: 'location' });
    const replacement = (at: Session) =>
      working(
        entryIn(at, (entry) => entry.slot === lift.slot && entry.id !== lift.id && !entry.stopped),
      );
    const done = begin(eased, lift.id).completed.sets.filter(
      (set) => set.entryId === lift.id && set.kind === 'working',
    ).length;
    const left = working(lift).length - done;
    const there = moved(eased);
    expect(entryIn(there, (entry) => entry.id === lift.id).stopped?.owed).toBe(left);
    expect(replacement(there)).toHaveLength(left);
    expect(left).toBeLessThan(replacement(moved(session)).length);
    expect(replacement(backToPlan(there))).toHaveLength(left);
  });

  it('owes a new place nothing for a lift done under the ease', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        barWeightFor(requireExercise(entry.exerciseId), 'lb') !== null &&
        working(entry).length < entry.eased.sets!.filter((set) => set.kind === 'working').length,
    )!;
    // Every set of it logged, ramps and the eased working sets.
    const done: Session = {
      ...eased,
      completed: {
        ...eased.completed,
        sets: [
          ...eased.completed.sets,
          ...lift.sets.map((set) => ({
            entryId: lift.id,
            exerciseId: lift.exerciseId,
            setIndex: set.index,
            kind: set.kind,
            reps: set.targetReps[0],
            weight: set.targetWeight,
            rir: set.targetRir,
            completedAt: NOW,
          })),
        ],
      },
    };
    const there = run({ ...done, location: home }, { type: 'location' });
    expect(entryIn(there, (entry) => entry.id === lift.id).stopped?.owed ?? 0).toBe(0);
    expect(
      allEntries(there.workout.blocks).some(
        (entry) => entry.slot === lift.slot && entry.id !== lift.id && !isStopped(entry),
      ),
    ).toBe(false);
  });

  it('keeps no record on a lift stopped for a stand-in: undone, it takes no sets back', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0,
    )!;
    const swapped = run(begin(eased, lift.id), {
      type: 'replace',
      entryId: lift.id,
      exerciseId: requireExercise(lift.exerciseId).substitutions![0]!,
    });
    // Its record goes with the sets it was for (the eleventh pass took back the tenth's keeping).
    expect(entryIn(swapped, (entry) => entry.id === lift.id).eased?.sets).toBeUndefined();
    // What began it undone, the stopped lift is not begun: a change gives it no sets.
    const other = toCome(swapped).find((entry) => entry.id !== lift.id && !entry.stopped)!;
    const undone = run(
      { ...swapped, completed: eased.completed },
      { type: 'pin', entryId: other.id, pinned: true },
    );
    expect(working(entryIn(undone, (entry) => entry.id === lift.id))).toHaveLength(0);
  });

  it('swaps back to a lift stopped during the ease with what its stand-in showed still to come', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0 &&
        working(entry).length < entry.eased.sets!.filter((set) => set.kind === 'working').length,
    )!;
    const other = requireExercise(lift.exerciseId).substitutions![0]!;
    const doneOn = (at: Session, id: string) =>
      at.completed.sets.filter((set) => set.entryId === id && set.kind === 'working').length;
    // The lift begun and swapped: its stand-in takes what it showed still to come.
    const begun = begin(eased, lift.id);
    const swapped = run(begun, { type: 'replace', entryId: lift.id, exerciseId: other });
    const stand = entryIn(
      swapped,
      (entry) => entry.replacedFrom === lift.exerciseId && entry.id !== lift.id,
    );
    expect(working(stand)).toHaveLength(working(lift).length - doneOn(begun, lift.id));
    // The stand-in begun, then swapped back: the lift picks up what the stand-in showed.
    const started = begin(swapped, stand.id);
    const owed = working(stand).length - doneOn(started, stand.id);
    const back = run(started, { type: 'replace', entryId: stand.id, exerciseId: lift.exerciseId });
    const before = working(entryIn(started, (entry) => entry.id === lift.id)).length;
    expect(working(entryIn(back, (entry) => entry.id === lift.id)).length - before).toBe(owed);
  });

  it('says the rest stays eased when a check-in after a hard start changes nothing', () => {
    // At the plan's own length a sore check-in takes the set the hard start took: nothing moves.
    const after = run(hardStart(underWay(base, gym, 'default')), {
      type: 'readiness',
      readiness: sore,
    });
    expect(after.result!.changes).toEqual([]);
    expect(after.result!.summary.headline).toBe(
      'Checked in: the rest stays eased for the hard start.',
    );
  });

  it("counts a pair's lifts by their working sets when a swap ends the pairing under way", () => {
    const session = underWay(base, gym, 'default');
    const pair = session.workout.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        !block.entries.some((entry) =>
          session.completed.sets.some((s) => s.entryId === entry.id),
        ) &&
        requireExercise(block.entries[0]!.exerciseId).dropSetSafe &&
        (requireExercise(block.entries[1]!.exerciseId).substitutions ?? []).length > 0,
    );
    if (!pair) throw new Error('no superset to come');
    const [first, second] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const dropped = run(session, { type: 'drop-set', entryId: first.id, on: true });
    const logged = (at: Session, entry: WorkoutEntry): Session => {
      const set = working(entryIn(at, (candidate) => candidate.id === entry.id))[0]!;
      return {
        ...at,
        completed: {
          ...at.completed,
          sets: [
            ...at.completed.sets,
            {
              entryId: entry.id,
              exerciseId: entry.exerciseId,
              setIndex: set.index,
              kind: 'working',
              reps: set.targetReps[0],
              weight: set.targetWeight,
              rir: set.targetRir,
              completedAt: NOW,
            },
          ],
        },
      };
    };
    // Both under way, the second swapped: the pairing ends, each lift in a block of its own.
    const under = logged(logged(dropped, first), second);
    const swapped = run(under, {
      type: 'replace',
      entryId: second.id,
      exerciseId: requireExercise(second.exerciseId).substitutions[0]!,
    });
    const own = swapped.workout.blocks.find(
      (block) => block.kind === 'straight' && block.entries[0]!.id === first.id,
    )!;
    expect(own.entries[0]!.sets.some((set) => set.kind === 'drop')).toBe(true);
    expect(own.rounds).toBe(roundsOf(own.entries[0]!));
  });

  it('keeps a weight set by hand on a lift under way through an undo and a later change', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined && working(entry).some((set) => (set.targetWeight ?? 0) > 20),
    )!;
    const first = working(lift)[0]!;
    const logged: Session = {
      ...eased,
      completed: {
        ...eased.completed,
        sets: [
          ...eased.completed.sets,
          {
            entryId: lift.id,
            exerciseId: lift.exerciseId,
            setIndex: first.index,
            kind: 'working',
            reps: first.targetReps[0],
            weight: first.targetWeight,
            rir: first.targetRir,
            completedAt: NOW,
          },
        ],
      },
    };
    const chosen = (first.targetWeight as number) - 10;
    const weighed = run(logged, { type: 'target-weight', entryId: lift.id, weight: chosen });
    // Its set undone, then any change: the weight the lifter chose stands (the eighth pass).
    const undone = run(
      { ...weighed, completed: eased.completed },
      {
        type: 'pin',
        entryId: toCome(eased).find((entry) => entry.id !== lift.id)!.id,
        pinned: true,
      },
    );
    // The sets it changed keep the chosen weight; the one logged then keeps the ease's. Nothing
    // comes back from the plan.
    const [kept, ...rest] = working(entryIn(undone, (entry) => entry.id === lift.id));
    expect(kept!.targetWeight).toBe(first.targetWeight);
    expect(rest.length).toBeGreaterThan(0);
    for (const set of rest) expect(set.targetWeight).toBe(chosen);
  });

  it('gives a stand-in the count set by hand on the lift it stands in for', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0,
    )!;
    const begun = begin(eased, lift.id);
    let more = run(begun, { type: 'sets', entryId: lift.id, workingDelta: 1 });
    more = run(more, { type: 'sets', entryId: lift.id, workingDelta: 1 });
    const count = working(entryIn(more, (entry) => entry.id === lift.id)).length;
    const swapped = run(more, {
      type: 'replace',
      entryId: lift.id,
      exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
    });
    const stand = entryIn(
      swapped,
      (entry) => entry.replacedFrom === lift.exerciseId && entry.id !== lift.id,
    );
    // The lift owed the count set by hand, and the stand-in keeps it: no set comes off a count
    // the lifter set (the ninth pass).
    const owed =
      count -
      begun.completed.sets.filter((s) => s.entryId === lift.id && s.kind === 'working').length;
    expect(working(stand)).toHaveLength(owed);
  });

  it('leaves a lift begun before the hard start as it is when its sets are undone', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const first = allEntries(eased.workout.blocks)[0]!;
    // The first lift, under way before the ease, its set undone: no change eases it unsaid.
    const undone = run(
      { ...eased, completed: { ...eased.completed, sets: [] } },
      { type: 'pin', entryId: toCome(eased)[0]!.id, pinned: true },
    );
    expect(working(entryIn(undone, (entry) => entry.id === first.id))).toEqual(working(first));
  });

  it('owes a new place the count set by hand on a lift under way', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined && barWeightFor(requireExercise(entry.exerciseId), 'lb') !== null,
    )!;
    const begun = begin(eased, lift.id);
    let more = run(begun, { type: 'sets', entryId: lift.id, workingDelta: 1 });
    more = run(more, { type: 'sets', entryId: lift.id, workingDelta: 1 });
    const shown = working(entryIn(more, (entry) => entry.id === lift.id));
    const done = begun.completed.sets.filter(
      (set) => set.entryId === lift.id && set.kind === 'working',
    ).length;
    const there = run({ ...more, location: home }, { type: 'location' });
    const stopped = entryIn(there, (entry) => entry.id === lift.id);
    // The lift owed what it showed, the count set by hand (the eighth pass).
    expect(stopped.stopped?.owed).toBe(shown.length - done);
  });

  it('swaps back with the count set by hand on the stand-in', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0,
    )!;
    const other = requireExercise(lift.exerciseId).substitutions[0]!;
    const swapped = run(begin(eased, lift.id), {
      type: 'replace',
      entryId: lift.id,
      exerciseId: other,
    });
    const stand = entryIn(
      swapped,
      (entry) => entry.replacedFrom === lift.exerciseId && entry.id !== lift.id,
    );
    const started = begin(swapped, stand.id);
    // Two by hand: past the plan's count, so the count set by hand and the plan's differ.
    let more = run(started, { type: 'sets', entryId: stand.id, workingDelta: 1 });
    more = run(more, { type: 'sets', entryId: stand.id, workingDelta: 1 });
    const owed =
      working(entryIn(more, (entry) => entry.id === stand.id)).length -
      started.completed.sets.filter((set) => set.entryId === stand.id && set.kind === 'working')
        .length;
    const back = run(more, { type: 'replace', entryId: stand.id, exerciseId: lift.exerciseId });
    const picked = working(entryIn(back, (entry) => entry.id === lift.id));
    const before = working(entryIn(started, (entry) => entry.id === lift.id));
    expect(picked.length - before.length).toBe(owed);
  });

  it('times a copy saved after a rebuild under way for its own length, whole', () => {
    const session = underWay(base, gym, 'default');
    const later: Session = {
      ...session,
      completed: { ...session.completed, elapsedSeconds: 30 * 60 },
    };
    const checked = run(later, { type: 'readiness', readiness: sore });
    // The rebuild fitted the rest to the minutes left, with no general warm-up.
    expect(checked.workout.duration.targetMinutes).toBeLessThan(
      session.workout.duration.targetMinutes,
    );
    expect(checked.workout.warmup.generalMinutes).toBe(0);
    const copy = planUnderTheEase(checked.workout);
    expect(copy.duration.targetMinutes).toBe(session.workout.duration.targetMinutes);
    expect(copy.warmup.generalMinutes).toBe(session.workout.warmup.generalMinutes);
    expect(copy.warmup.note).toBe(session.workout.warmup.note);
    expect(copy.explanation.summary).not.toMatch(/min left/);
    expect(copy.compromises.join(' ')).not.toMatch(/min left/);
    expect(copy.duration.overByMinutes).toBe(
      Math.max(
        0,
        Math.round((copy.explanation.time.totalMinutes - copy.duration.targetMinutes) * 10) / 10,
      ),
    );
    expect(copy.explanation.time.warmupMinutes).toBeGreaterThan(0);
    // A line of how far over the minutes left, or the leanest fit of them, goes with them.
    const over = planUnderTheEase({
      ...checked.workout,
      compromises: [
        'Runs about 5 min over the 30 min left.',
        'Even the leanest version runs about 4 min over 30 min.',
      ],
    });
    expect(over.compromises.join(' ')).not.toMatch(/over (the )?30 min/);
  });

  it('counts a copy as it loads: a lift stopped on the day goes, its sets to what stood in', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const lift = toCome(session).find(
      (entry) =>
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0 && entry.warmupSets > 0,
    )!;
    const swapped = run(begin(session, lift.id), {
      type: 'replace',
      entryId: lift.id,
      exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
    });
    expect(allEntries(swapped.workout.blocks).some(isStopped)).toBe(true);
    const copy = planUnderTheEase(swapped.workout);
    const entries = allEntries(copy.blocks);
    expect(entries.some(isStopped)).toBe(false);
    expect(copy.explanation.summary).toContain(`: ${entries.length} exercises in about`);
    // Its ramps list only what it holds.
    expect(copy.warmup.rampEntryIds).toEqual(
      entries.filter((entry) => entry.warmupSets > 0).map((entry) => entry.id),
    );
  });

  it('lets a mark on a lift begun before the hard start go with it: a later one eases that lift', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const first = allEntries(eased.workout.blocks)[0]!;
    expect(first.eased).toEqual({ exerciseId: first.exerciseId, kept: true });
    // Its set undone, and the start no longer short: back to plan, and the mark goes.
    const undone: Session = { ...eased, completed: { ...eased.completed, sets: [] } };
    const back = backToPlan(undone);
    expect(entryIn(back, (entry) => entry.id === first.id).eased).toBeUndefined();
    // A hard start told later eases it, nothing of it logged.
    const again = entryIn(hardStart(back), (entry) => entry.id === first.id);
    expect(again.eased?.sets).toBeDefined();
    expect(working(again)[0]!.targetRir).toBe(working(first)[0]!.targetRir + 1);
  });

  it('keeps a lift that was under way as it is, its sets undone, through new weights, a check-in and a max', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        working(entry).some((set) => (set.targetWeight ?? 0) > 20 && set.targetRir < 4),
    )!;
    const first = working(lift)[0]!;
    const logged: Session = {
      ...eased,
      completed: {
        ...eased.completed,
        sets: [
          ...eased.completed.sets,
          {
            entryId: lift.id,
            exerciseId: lift.exerciseId,
            setIndex: first.index,
            kind: 'working',
            reps: first.targetReps[0],
            weight: first.targetWeight,
            rir: first.targetRir,
            completedAt: NOW,
          },
        ],
      },
    };
    // A change while it is under way keeps its record; then its set is undone.
    const pinned = run(logged, { type: 'pin', entryId: lift.id, pinned: true });
    expect(entryIn(pinned, (entry) => entry.id === lift.id).eased?.kept).toBe(true);
    const undone: Session = { ...pinned, completed: eased.completed };
    const shape = (entry: WorkoutEntry) =>
      working(entry).map((set) => [set.targetReps, set.targetRir]);
    const before = entryIn(undone, (entry) => entry.id === lift.id);
    for (const trigger of [
      { type: 'loading' },
      { type: 'readiness', readiness: sore },
      { type: 'max', exerciseId: lift.exerciseId },
    ] as const) {
      const after = entryIn(run(undone, trigger), (entry) => entry.id === lift.id);
      expect(shape(after)).toEqual(shape(before));
      expect(after.progression?.evidence[0]).toMatch(/^Eased for a hard start/);
    }
  });

  it('gives a copy a lift changed under way as it was before the ease, its own settings too', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased !== undefined &&
        requireExercise(entry.exerciseId).dropSetSafe &&
        working(entry).some((set) => (set.targetWeight ?? 0) > 20),
    )!;
    const plan = entryIn(session, (entry) => entry.id === lift.id);
    const planBlock = session.workout.blocks.find((block) =>
      block.entries.some((entry) => entry.id === lift.id),
    )!;
    let at = begin(eased, lift.id);
    at = run(at, { type: 'rest-adjust', entryId: lift.id, deltaSeconds: 30 });
    at = run(at, {
      type: 'target-weight',
      entryId: lift.id,
      weight: (working(lift)[0]!.targetWeight as number) - 10,
    });
    at = run(at, { type: 'sets', entryId: lift.id, workingDelta: 1 });
    at = run(at, { type: 'drop-set', entryId: lift.id, on: true });
    at = run(at, { type: 'add-warmup', entryId: lift.id });
    const copy = planUnderTheEase(at.workout);
    const kept = allEntries(copy.blocks).find((entry) => entry.id === lift.id)!;
    expect(kept.sets).toEqual(plan.sets);
    expect(kept.restSeconds).toBe(plan.restSeconds);
    expect(kept.warmupSets).toBe(plan.warmupSets);
    expect(kept.dropSet).toBe(plan.dropSet);
    expect(kept.manual).toEqual(plan.manual);
    const block = copy.blocks.find((candidate) =>
      candidate.entries.some((entry) => entry.id === lift.id),
    )!;
    expect(block.restBetweenRoundsSeconds).toBe(planBlock.restBetweenRoundsSeconds);
    // The record stays on the lift through Back to plan: a copy then is the same.
    const later = planUnderTheEase(backToPlan(at).workout);
    expect(allEntries(later.blocks).find((entry) => entry.id === lift.id)!.sets).toEqual(plan.sets);
  });

  /** A session with one working set of a lift logged at its targets. */
  const loggedOn = (at: Session, entry: WorkoutEntry): Session => {
    const set = working(entry)[0]!;
    return {
      ...at,
      completed: {
        ...at.completed,
        sets: [
          ...at.completed.sets,
          {
            entryId: entry.id,
            exerciseId: entry.exerciseId,
            setIndex: set.index,
            kind: 'working',
            reps: set.targetReps[0],
            weight: set.targetWeight,
            rir: set.targetRir,
            completedAt: NOW,
          },
        ],
      },
    };
  };

  it('lets a lift begun before the hard start, its sets undone, take a check-in and a max as any lift does', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const first = allEntries(eased.workout.blocks)[0]!;
    expect(first.eased).toEqual({ exerciseId: first.exerciseId, kept: true });
    // Its set undone, the hard start still in force; and the same day with no hard start.
    const undone: Session = { ...eased, completed: { ...eased.completed, sets: [] } };
    const plain: Session = { ...session, completed: { ...session.completed, sets: [] } };
    const shape = (at: Session) =>
      working(entryIn(at, (entry) => entry.id === first.id)).map((set) => [
        set.targetReps,
        set.targetRir,
        set.targetWeight,
      ]);
    const low = { type: 'readiness', readiness: tired } as const;
    expect(shape(run(undone, low))).toEqual(shape(run(plain, low)));
    const maxes = recordMax(emptyMaxes(), first.exerciseId, { kind: 'max', e1rm: 250 }, 'lb', NOW);
    const max = { type: 'max', exerciseId: first.exerciseId } as const;
    const withMax = run({ ...undone, maxes }, max);
    expect(shape(withMax)).toEqual(shape(run({ ...plain, maxes }, max)));
    expect(withMax.result!.max).not.toBe('by-hand');
  });

  it('says a max on a lift that keeps the ease, its pair under way, counts from the next session', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const pair = eased.workout.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        block.entries.every((entry) => entry.eased?.sets !== undefined) &&
        !block.entries.some((entry) => eased.completed.sets.some((s) => s.entryId === entry.id)),
    );
    if (!pair) throw new Error('no eased superset to come');
    const [a1, a2] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const maxes = recordMax(emptyMaxes(), a2.exerciseId, { kind: 'max', e1rm: 100 }, 'lb', NOW);
    const after = run(
      { ...loggedOn(eased, a1), maxes },
      { type: 'max', exerciseId: a2.exerciseId },
    );
    expect(after.result!.max).toBe('under-way');
    // It keeps the sets the ease left it.
    expect(working(entryIn(after, (entry) => entry.id === a2.id))).toEqual(working(a2));
  });

  it('gives a copy the plan at the weights here for a lift under way when the weights changed', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased?.sets !== undefined &&
        requireExercise(entry.exerciseId).name.includes('Dumbbell') &&
        working(entry).length > 1 &&
        working(entry).every((set) => (set.targetWeight ?? 0) > 15),
    );
    if (!lift) throw new Error('no eased dumbbell lift to come');
    const first = working(lift)[0]!;
    const frozen = run(loggedOn(eased, lift), { type: 'pin', entryId: lift.id, pinned: true });
    expect(entryIn(frozen, (entry) => entry.id === lift.id).eased?.kept).toBe(true);
    // The dumbbells here now stop at 15 lb.
    const moved = run({ ...frozen, location: light }, { type: 'loading' });
    const copy = planUnderTheEase(moved.workout);
    const kept = allEntries(copy.blocks).find((entry) => entry.id === lift.id)!;
    const toComeInCopy = working(kept).filter((set) => set.index !== first.index);
    expect(toComeInCopy.length).toBeGreaterThan(0);
    for (const set of toComeInCopy) expect(set.targetWeight ?? 0).toBeLessThanOrEqual(15);
  });

  it('keeps no fitting step of another length in a copy', () => {
    const session = underWay(base, gym, 'default');
    const later: Session = {
      ...session,
      completed: { ...session.completed, elapsedSeconds: 30 * 60 },
    };
    const checked = run(later, { type: 'readiness', readiness: sore });
    const step = (minutes: number) => `Left out Hammer Curl so the session fits ${minutes} min.`;
    const stepped = (workout: GeneratedWorkout, minutes: number): GeneratedWorkout => ({
      ...workout,
      explanation: { ...workout.explanation, fittingSteps: [step(minutes)] },
    });
    const left = checked.workout.duration.targetMinutes;
    expect(planUnderTheEase(stepped(checked.workout, left)).explanation.fittingSteps).toEqual([]);
    // A plan fitted to its own length keeps its steps.
    const own = session.workout.duration.targetMinutes;
    expect(planUnderTheEase(stepped(session.workout, own)).explanation.fittingSteps).toEqual([
      step(own),
    ]);
  });

  it('names in a copy only the lifts it holds: a lift finished before a place change is not first', () => {
    const session = underWay(base, gym, 'default');
    const first = allEntries(session.workout.blocks)[0]!;
    // Every set of the first lift logged, then home, which cannot equip it.
    const done: Session = {
      ...session,
      completed: {
        ...session.completed,
        sets: first.sets.map((set) => ({
          entryId: first.id,
          exerciseId: first.exerciseId,
          setIndex: set.index,
          kind: set.kind,
          reps: set.targetReps[0],
          weight: set.targetWeight,
          rir: set.targetRir,
          completedAt: NOW,
        })),
      },
    };
    const there = run({ ...done, location: home }, { type: 'location' });
    expect(entryIn(there, (entry) => entry.id === first.id).stopped?.owed).toBe(0);
    const name = requireExercise(first.exerciseId).name;
    expect(there.workout.explanation.summary).toContain(`${name} first`);
    const copy = planUnderTheEase(there.workout);
    const names = new Set(
      allEntries(copy.blocks).map((entry) => requireExercise(entry.exerciseId).name),
    );
    expect(names.has(name)).toBe(false);
    expect(copy.explanation.summary).not.toContain(name);
    for (const line of copy.explanation.reasons) {
      const named = mainLiftName(line);
      if (named !== null) expect(names.has(named)).toBe(true);
    }
  });

  it('carries a lift stopped under the ease into a copy by its sets done, its record aside', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased?.sets !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0 &&
        eased.workout.blocks.some(
          (block) => block.kind === 'straight' && block.entries[0]!.id === entry.id,
        ),
    )!;
    const swapped = run(loggedOn(eased, lift), {
      type: 'replace',
      entryId: lift.id,
      exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
    });
    const stand = entryIn(
      swapped,
      (entry) => entry.replacedFrom === lift.exerciseId && entry.id !== lift.id,
    );
    const copy = planUnderTheEase(swapped.workout);
    const carried = allEntries(copy.blocks).find((entry) => entry.id === stand.id)!;
    // The one set done goes with what stood in, on top of its own.
    expect(working(carried)).toHaveLength(working(stand).length + 1);
  });

  it('gives a copy no more than the ease left after a swap away and back', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased?.sets !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0 &&
        eased.workout.blocks.some(
          (block) => block.kind === 'straight' && block.entries[0]!.id === entry.id,
        ) &&
        working(entry).length >= 3,
    )!;
    const swapped = run(loggedOn(eased, lift), {
      type: 'replace',
      entryId: lift.id,
      exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
    });
    const stand = entryIn(
      swapped,
      (entry) => entry.replacedFrom === lift.exerciseId && entry.id !== lift.id,
    );
    const back = run(loggedOn(swapped, stand), {
      type: 'replace',
      entryId: stand.id,
      exerciseId: lift.exerciseId,
    });
    const copy = planUnderTheEase(back.workout);
    const kept = allEntries(copy.blocks).find((entry) => entry.id === lift.id)!;
    // The count the ease left, as a known limit says: never the plan's on top of the sets done.
    expect(working(kept)).toHaveLength(working(lift).length);
  });

  it('hands the place of a lift keeping the ease, its set undone, on as it stands', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased?.sets !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0 &&
        working(entry).length < entry.eased.sets.filter((set) => set.kind === 'working').length,
    )!;
    // Begun and changed (its record kept for good), then its set undone.
    const kept = run(loggedOn(eased, lift), {
      type: 'rest-adjust',
      entryId: lift.id,
      deltaSeconds: 15,
    });
    expect(entryIn(kept, (entry) => entry.id === lift.id).eased?.kept).toBe(true);
    const undone: Session = { ...kept, completed: eased.completed };
    const swapped = run(undone, {
      type: 'replace',
      entryId: lift.id,
      exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
    });
    // Eased once: the count and the rep in reserve the lift showed, and said so.
    const came = entryIn(swapped, (entry) => entry.id === lift.id);
    expect(working(came)).toHaveLength(working(lift).length);
    expect(working(came)[0]!.targetRir).toBe(working(lift)[0]!.targetRir);
    expect(came.progression?.evidence[0]).toMatch(/^Eased for a hard start/);
    // Kept for good, as on the lift: Back to plan leaves it, and a copy has the plan's count.
    expect(working(entryIn(backToPlan(swapped), (entry) => entry.id === lift.id))).toHaveLength(
      working(lift).length,
    );
    const planned = lift.eased!.sets!.filter((set) => set.kind === 'working').length;
    const copy = planUnderTheEase(swapped.workout);
    expect(working(allEntries(copy.blocks).find((entry) => entry.id === lift.id)!)).toHaveLength(
      planned,
    );
  });

  it("gives a copy a refitted record's ramps as the refit left them", () => {
    // A lift the light dumbbells here leave fewer ramps: its copy counts the ramps it holds.
    const lighter: LocationProfile = {
      ...gym,
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 10, step: 5 }] } },
    };
    for (const style of STYLES) {
      const session = underWay({ ...base, programStyle: style }, gym, 'default');
      const eased = hardStart(session);
      for (const lift of toCome(eased)) {
        if (lift.eased?.sets === undefined || lift.warmupSets < 2) continue;
        const kept = run(loggedOn(eased, lift), {
          type: 'rest-adjust',
          entryId: lift.id,
          deltaSeconds: 15,
        });
        const undone: Session = { ...kept, completed: eased.completed };
        const moved = run({ ...undone, location: lighter }, { type: 'loading' });
        const copy = planUnderTheEase(moved.workout);
        const entry = allEntries(copy.blocks).find((candidate) => candidate.id === lift.id)!;
        const ramps = entry.sets.filter((set) => set.kind === 'warmup').length;
        if (ramps >= lift.warmupSets) continue;
        expect(entry.warmupSets).toBe(ramps);
        return;
      }
    }
    throw new Error('no eased lift whose ramps the light dumbbells cut');
  });

  it('swaps in place with the count set by hand on a lift keeping the ease, its set undone', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased?.sets !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0,
    )!;
    let at = run(loggedOn(eased, lift), {
      type: 'rest-adjust',
      entryId: lift.id,
      deltaSeconds: 15,
    });
    // Two sets added by hand, past the plan's count.
    at = run(at, { type: 'sets', entryId: lift.id, workingDelta: 1 });
    at = run(at, { type: 'sets', entryId: lift.id, workingDelta: 1 });
    const count = working(entryIn(at, (entry) => entry.id === lift.id)).length;
    const undone: Session = { ...at, completed: eased.completed };
    const swapped = run(undone, {
      type: 'replace',
      entryId: lift.id,
      exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
    });
    const came = working(entryIn(swapped, (entry) => entry.id === lift.id));
    expect(came).toHaveLength(count);
    // Eased as any lift to come, its count set by hand kept: no record of the old exercise holds
    // the ease off it.
    expect(came[0]!.targetRir).toBe(working(lift)[0]!.targetRir);
  });

  it('keeps the count a pair member under way shows when it is swapped in place', () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const pair = eased.workout.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        block.entries.every((entry) => entry.eased?.sets !== undefined) &&
        !block.entries.some((entry) => eased.completed.sets.some((s) => s.entryId === entry.id)) &&
        (requireExercise(block.entries[1]!.exerciseId).substitutions ?? []).length > 0,
    );
    if (!pair) throw new Error('no eased superset to come');
    const [a1, a2] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const swapped = run(loggedOn(eased, a1), {
      type: 'replace',
      entryId: a2.id,
      exerciseId: requireExercise(a2.exerciseId).substitutions[0]!,
    });
    const member = working(entryIn(swapped, (entry) => entry.id === a2.id));
    expect(member).toHaveLength(working(a2).length);
    // And the rep in reserve it showed (the fourteenth pass: the plan's came back).
    expect(member[0]!.targetRir).toBe(working(a2)[0]!.targetRir);
    const block = swapped.workout.blocks.find((candidate) =>
      candidate.entries.some((entry) => entry.id === a2.id),
    )!;
    expect(block.rounds).toBe(roundsRun(block));
  });

  it("gives a copy the plan's count of a lift swapped in a pair under way", () => {
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const pair = eased.workout.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        block.entries.every(
          (entry) =>
            entry.eased?.sets !== undefined &&
            working(entry).length < entry.eased.sets.filter((set) => set.kind === 'working').length,
        ) &&
        !block.entries.some((entry) => eased.completed.sets.some((s) => s.entryId === entry.id)) &&
        (requireExercise(block.entries[1]!.exerciseId).substitutions ?? []).length > 0,
    );
    if (!pair) throw new Error('no eased superset to come');
    const [a1, a2] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const swapped = run(loggedOn(eased, a1), {
      type: 'replace',
      entryId: a2.id,
      exerciseId: requireExercise(a2.exerciseId).substitutions[0]!,
    });
    // The workout keeps the count it showed; a copy has the plan's, as for its partner.
    expect(working(entryIn(swapped, (entry) => entry.id === a2.id))).toHaveLength(
      working(a2).length,
    );
    const copy = planUnderTheEase(swapped.workout);
    const planned = a2.eased!.sets!.filter((set) => set.kind === 'working').length;
    expect(working(allEntries(copy.blocks).find((entry) => entry.id === a2.id)!)).toHaveLength(
      planned,
    );
  });

  it('keeps the count a lift keeping the ease showed when it is swapped with no hard start in force', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased?.sets !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0 &&
        working(entry).length < entry.eased.sets.filter((set) => set.kind === 'working').length,
    )!;
    // Begun and changed, so it keeps the ease; its set undone; then back to plan.
    const kept = run(loggedOn(eased, lift), {
      type: 'rest-adjust',
      entryId: lift.id,
      deltaSeconds: 15,
    });
    const back = backToPlan({ ...kept, completed: eased.completed });
    expect(working(entryIn(back, (entry) => entry.id === lift.id))).toHaveLength(
      working(lift).length,
    );
    const swapped = run(back, {
      type: 'replace',
      entryId: lift.id,
      exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
    });
    // No ease is laid now: what comes in keeps the count and reserve the lift showed, never the
    // plan's unsaid.
    const came = working(entryIn(swapped, (entry) => entry.id === lift.id));
    expect(came).toHaveLength(working(lift).length);
    expect(came[0]!.targetRir).toBe(working(lift)[0]!.targetRir);
    // A copy has the plan's count.
    const planned = lift.eased!.sets!.filter((set) => set.kind === 'working').length;
    const copy = planUnderTheEase(swapped.workout);
    expect(working(allEntries(copy.blocks).find((entry) => entry.id === lift.id)!)).toHaveLength(
      planned,
    );
  });

  it("keeps an end time's trim on what comes in for a lift keeping the ease", () => {
    for (const style of STYLES) {
      const session = underWay({ ...base, programStyle: style }, gym, 'default');
      const eased = hardStart(session);
      for (const lift of toCome(eased)) {
        if (
          lift.eased?.sets === undefined ||
          (requireExercise(lift.exerciseId).substitutions ?? []).length === 0 ||
          !eased.workout.blocks.some(
            (block) => block.kind === 'straight' && block.entries[0]!.id === lift.id,
          )
        ) {
          continue;
        }
        const kept = run(loggedOn(eased, lift), {
          type: 'rest-adjust',
          entryId: lift.id,
          deltaSeconds: 15,
        });
        const undone: Session = {
          ...kept,
          completed: { ...eased.completed, currentEntryId: lift.id },
        };
        const soon = new Date(Date.parse(NOW) + 10 * 60_000).toISOString();
        const trimmed = run(undone, { type: 'end-by', time: soon });
        const shownCount = working(entryIn(trimmed, (entry) => entry.id === lift.id)).length;
        if (shownCount >= working(lift).length) continue;
        const swapped = run(trimmed, {
          type: 'replace',
          entryId: lift.id,
          exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
        });
        expect(working(entryIn(swapped, (entry) => entry.id === lift.id))).toHaveLength(shownCount);
        return;
      }
    }
    throw new Error('no lift keeping the ease that an end time trims');
  });

  it('hands on the mark of a lift begun before the hard start: no ease lands on what comes in', () => {
    const session = underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default');
    const eased = hardStart(session);
    const first = allEntries(eased.workout.blocks)[0]!;
    expect(first.eased).toEqual({ exerciseId: first.exerciseId, kept: true });
    const undone: Session = { ...eased, completed: { ...eased.completed, sets: [] } };
    const other = requireExercise(first.exerciseId).substitutions?.[0];
    if (!other) throw new Error('no swap for the first lift');
    const swapped = run(undone, { type: 'replace', entryId: first.id, exerciseId: other });
    const came = entryIn(swapped, (entry) => entry.id === first.id);
    expect(came.eased).toEqual({ exerciseId: other, kept: true });
  });

  it('brings what comes in to the reserve the lift showed under "Make it harder"', () => {
    const harder = run(underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default'), {
      type: 'intensity',
      direction: 'harder',
    });
    const eased = hardStart(harder);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased?.sets !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0,
    );
    if (!lift) throw new Error('no eased lift to come');
    const kept = run(loggedOn(eased, lift), {
      type: 'rest-adjust',
      entryId: lift.id,
      deltaSeconds: 15,
    });
    const swapped = run(
      { ...kept, completed: eased.completed },
      {
        type: 'replace',
        entryId: lift.id,
        exerciseId: requireExercise(lift.exerciseId).substitutions[0]!,
      },
    );
    const came = working(entryIn(swapped, (entry) => entry.id === lift.id));
    expect(came).toHaveLength(working(lift).length);
    expect(came[0]!.targetRir).toBe(working(lift)[0]!.targetRir);
  });

  it('eases what comes in for a lift keeping the ease as the layer eases the same swap', () => {
    // Every style, "Make it harder", and an undulating lift on another zone than its swap.
    const zoned = [
      record(3, 'incline-dumbbell-press', [[8, 30, 2]], [6, 10], 1, { templateId: 'legs' }),
    ];
    const days: { profile: UserProfile; harder: boolean; history: WorkoutRecord[] }[] = [
      ...STYLES.map((style) => ({
        profile: { ...base, programStyle: style },
        harder: false,
        history: [],
      })),
      ...STYLES.map((style) => ({
        profile: { ...base, programStyle: style },
        harder: true,
        history: [],
      })),
      { profile: { ...base, programStyle: 'undulating' }, harder: false, history: zoned },
    ];
    const shape = (entry: WorkoutEntry) =>
      working(entry).map((set) => [set.targetReps, set.targetRir, set.targetWeight]);
    let compared = 0;
    for (const day of days) {
      let session = underWay(day.profile, gym, 'default', emptyConstraints(), day.history);
      if (day.harder) session = run(session, { type: 'intensity', direction: 'harder' });
      const eased = hardStart(session);
      for (const lift of toCome(eased)) {
        const other = requireExercise(lift.exerciseId).substitutions?.[0];
        if (lift.eased?.sets === undefined || !other) continue;
        // The layer's swap: the lift not kept, its plan given back and what comes in eased.
        const layer = entryIn(
          run(eased, { type: 'replace', entryId: lift.id, exerciseId: other }),
          (entry) => entry.id === lift.id,
        );
        // The lift kept (begun and changed, its set undone), then swapped.
        const kept = run(loggedOn(eased, lift), {
          type: 'rest-adjust',
          entryId: lift.id,
          deltaSeconds: 15,
        });
        const handed = entryIn(
          run(
            { ...kept, completed: eased.completed },
            { type: 'replace', entryId: lift.id, exerciseId: other },
          ),
          (entry) => entry.id === lift.id,
        );
        expect(shape(handed)).toEqual(shape(layer));
        expect(handed.progression?.evidence[0]).toBe(layer.progression?.evidence[0]);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(20);
  });

  it('eases what comes in for a count set by hand, and keeps it, where the layer would not', () => {
    // A pair under way: the layer lays no ease on it.
    const session = underWay(base, gym, 'default');
    const eased = hardStart(session);
    const pair = eased.workout.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        block.entries.every((entry) => entry.eased?.sets !== undefined) &&
        !block.entries.some((entry) => eased.completed.sets.some((s) => s.entryId === entry.id)) &&
        (requireExercise(block.entries[1]!.exerciseId).substitutions ?? []).length > 0,
    );
    if (!pair) throw new Error('no eased superset to come');
    const [a1, a2] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const more = run(eased, { type: 'sets', entryId: a2.id, workingDelta: 1 });
    const shown = working(entryIn(more, (entry) => entry.id === a2.id));
    const swapped = run(loggedOn(more, a1), {
      type: 'replace',
      entryId: a2.id,
      exerciseId: requireExercise(a2.exerciseId).substitutions[0]!,
    });
    const came = entryIn(swapped, (entry) => entry.id === a2.id);
    expect(working(came)).toHaveLength(shown.length);
    expect(working(came)[0]!.targetRir).toBe(shown[0]!.targetRir);
    expect(came.eased?.kept).toBe(true);
    expect(came.progression?.evidence[0]).toMatch(/^Eased for a hard start: a rep more in reserve/);
  });

  it('reads the effort of a stand-in from the day\'s settings for a lift keeping the ease, under "Make it harder"', () => {
    const harder = (at: Session) => run(at, { type: 'intensity', direction: 'harder' });
    const plainDay = harder(
      underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default'),
    );
    const eased = hardStart(plainDay);
    const lift = toCome(eased).find(
      (entry) =>
        entry.eased?.sets !== undefined &&
        (requireExercise(entry.exerciseId).substitutions ?? []).length > 0,
    )!;
    const other = requireExercise(lift.exerciseId).substitutions[0]!;
    const standIn = (at: Session) =>
      working(
        entryIn(
          run(
            loggedOn(
              at,
              entryIn(at, (entry) => entry.id === lift.id),
            ),
            {
              type: 'replace',
              entryId: lift.id,
              exerciseId: other,
            },
          ),
          (entry) => entry.replacedFrom === lift.exerciseId && entry.id !== lift.id,
        ),
      );
    // With the hard start a rep more in reserve than without it, never two.
    const without = standIn(plainDay)[0]!.targetRir;
    expect(standIn(eased)[0]!.targetRir).toBe(Math.min(4, without + 1));
  });

  it('credits the hard start with no set an end time trimmed', () => {
    for (const style of STYLES) {
      for (const length of [15, 30] as const) {
        const session = underWay({ ...base, programStyle: style }, gym, length);
        const eased = hardStart(session);
        for (const lift of toCome(eased)) {
          const other = requireExercise(lift.exerciseId).substitutions?.[0];
          if (lift.eased?.sets === undefined || !other) continue;
          // An ease that took no set: a rep more in reserve only.
          if (lift.progression?.evidence[0] !== 'Eased for a hard start: a rep more in reserve.') {
            continue;
          }
          const kept = run(loggedOn(eased, lift), {
            type: 'rest-adjust',
            entryId: lift.id,
            deltaSeconds: 15,
          });
          const undone: Session = {
            ...kept,
            completed: { ...eased.completed, currentEntryId: lift.id },
          };
          const soon = new Date(Date.parse(NOW) + 6 * 60_000).toISOString();
          const trimmed = run(undone, { type: 'end-by', time: soon });
          const count = working(entryIn(trimmed, (entry) => entry.id === lift.id)).length;
          if (count >= working(lift).length) continue;
          const came = entryIn(
            run(trimmed, { type: 'replace', entryId: lift.id, exerciseId: other }),
            (entry) => entry.id === lift.id,
          );
          expect(came.progression?.evidence[0]).toBe(
            'Eased for a hard start: a rep more in reserve.',
          );
          return;
        }
      }
    }
    throw new Error('no lift eased by a rep alone that an end time trims');
  });

  it('takes a low check-in made while the lift was under way once, as the layer would', () => {
    for (const style of STYLES) {
      const session = underWay({ ...base, programStyle: style }, gym, 'default');
      const eased = hardStart(session);
      const lift = toCome(eased).find(
        (entry) =>
          entry.eased?.sets !== undefined &&
          (requireExercise(entry.exerciseId).substitutions ?? []).length > 0,
      );
      if (!lift) continue;
      const other = requireExercise(lift.exerciseId).substitutions[0]!;
      const low = { type: 'readiness', readiness: tired } as const;
      // The layer's swap after the check-in, the lift not kept.
      const layer = working(
        entryIn(
          run(run(eased, low), { type: 'replace', entryId: lift.id, exerciseId: other }),
          (entry) => entry.id === lift.id,
        ),
      );
      // The lift kept, the check-in made while it is under way, its set undone, then swapped.
      const kept = run(loggedOn(eased, lift), {
        type: 'rest-adjust',
        entryId: lift.id,
        deltaSeconds: 15,
      });
      const checked = run(kept, low);
      const handed = working(
        entryIn(
          run(
            { ...checked, completed: eased.completed },
            { type: 'replace', entryId: lift.id, exerciseId: other },
          ),
          (entry) => entry.id === lift.id,
        ),
      );
      expect(handed[0]!.targetRir).toBe(layer[0]!.targetRir);
      // And says what the layer says: the set came off for the check-in, not the hard start.
      const words = (entries: WorkoutEntry[]) =>
        entries.flatMap((entry) => entry.progression?.evidence ?? []);
      const layerLift = entryIn(
        run(run(eased, low), { type: 'replace', entryId: lift.id, exerciseId: other }),
        (entry) => entry.id === lift.id,
      );
      const handedLift = entryIn(
        run(
          { ...checked, completed: eased.completed },
          { type: 'replace', entryId: lift.id, exerciseId: other },
        ),
        (entry) => entry.id === lift.id,
      );
      expect(
        words([handedLift]).filter((line) => line.startsWith('Eased for a hard start')),
      ).toEqual(words([layerLift]).filter((line) => line.startsWith('Eased for a hard start')));
      expect(words([handedLift])).not.toContain('Eased for a hard start: .');
      return;
    }
    throw new Error('no eased lift to come');
  });

  it('reads the effort of a lift picked up again from the day\'s settings, under "Make it harder"', () => {
    const harder = (at: Session) => run(at, { type: 'intensity', direction: 'harder' });
    const day = harder(underWay({ ...base, programStyle: 'hypertrophy-focus' }, gym, 'default'));
    const lift = toCome(day).find(
      (entry) => (requireExercise(entry.exerciseId).substitutions ?? []).length > 0,
    )!;
    const other = requireExercise(lift.exerciseId).substitutions[0]!;
    /** The lift begun and swapped, its stand-in begun and changed, then swapped back. */
    const back = (at: Session) => {
      const swapped = run(
        loggedOn(
          at,
          entryIn(at, (entry) => entry.id === lift.id),
        ),
        {
          type: 'replace',
          entryId: lift.id,
          exerciseId: other,
        },
      );
      const stand = entryIn(
        swapped,
        (entry) => entry.replacedFrom === lift.exerciseId && entry.id !== lift.id,
      );
      const changed = run(loggedOn(swapped, stand), {
        type: 'rest-adjust',
        entryId: stand.id,
        deltaSeconds: 15,
      });
      const picked = run(changed, {
        type: 'replace',
        entryId: stand.id,
        exerciseId: lift.exerciseId,
      });
      return working(entryIn(picked, (entry) => entry.id === lift.id)).at(-1)!;
    };
    // The sets that join it come as the plan has them, the hard start or not.
    expect(back(hardStart(day)).targetRir).toBe(back(day).targetRir);
  });
});
