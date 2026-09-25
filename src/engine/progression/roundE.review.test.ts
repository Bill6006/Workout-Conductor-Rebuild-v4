import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { WorkoutSession } from '../../core/state/session';
import { buildWorkoutRecord } from '../../core/state/workoutRecordBuilder';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type ProgramStyle } from '../../core/validation/profile';
import { LoggedSetSchema, type WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { coachingPolicy } from '../coach/experience';
import { REP_SECONDS, workSecondsFor } from '../duration/duration';
import { DUMBBELLS_KEY } from '../loading/loading';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork, RecalibrationTrigger } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { detectStalls } from '../strategy/plateau';
import { analyzeStrategy } from '../strategy/strategy';
import { SetPrescriptionSchema } from '../workout/workoutSchema';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { entryPushedToEffort, performanceHistory, recommendNextTarget } from './progression';
import { easyWarmupReps, prescribe } from './roles';

/**
 * Maintenance 23, the round's independent review. A set the weights at a place pushed (lighter,
 * more reps) remembers what it stood in for and is read back that way; breaks are read across
 * every session of a lift; and the lines say only what the app does.
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home');
const gym = places.find((place) => place.id === 'gym');
if (!home || !gym) throw new Error('no places');
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const incline = requireExercise('incline-dumbbell-press');
const rx = prescribe(incline, 'primary-hypertrophy', profile);

/** Home, with dumbbells up to `top` lb. */
const homeTo = (top: number): LocationProfile => ({
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: top, step: 5 }] } },
});
const lightHome = homeTo(20);

/** An incline press session at the 20 lb dumbbells, standing in for 30 lb at 6-10. */
function pushed(daysAgo: number, reps: number[]): WorkoutRecord {
  const done = record(
    daysAgo,
    'incline-dumbbell-press',
    reps.map((count): SetSpec => [count, 20, 1]),
    [25, 29],
    1,
  );
  for (const set of done.entries[0]?.sets ?? []) set.asked = { weight: 30, reps: [6, 10] };
  return done;
}

const nextIncline = (history: WorkoutRecord[]) =>
  recommendNextTarget({
    exercise: incline,
    role: 'primary-hypertrophy',
    prescription: rx,
    history,
    profile,
    now: NOW,
  });

describe('a set the dumbbells pushed is read as the set it stood in for', () => {
  it('asks the load it stood in for next time, not a collapse to 20 lb for 6-10', () => {
    expect(rx.reps).toEqual([6, 10]);
    const next = nextIncline([pushed(2, [27, 26, 25])]);
    expect(next.mode).not.toBe('estimate');
    expect(next.weight).toBe(30);
    expect(next.reps).toEqual([6, 10]);
    // The line the lifter sees still says what was lifted.
    expect(next.evidence[0]).toMatch(/^Last: 20 lb × 27, 26, 25 @ RIR 1 /);
  });

  it('keeps the planned effort session after session at the light home', () => {
    const plan = generateWorkout({
      profile,
      location: lightHome,
      history: [pushed(2, [27, 26, 25])],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const entry = allEntries(plan.blocks).find((item) => item.exerciseId === incline.id);
    const working = entry?.sets.filter((set) => set.kind === 'working') ?? [];
    expect(working.length).toBeGreaterThan(0);
    for (const set of working) {
      expect(set.targetWeight).toBe(20);
      expect(set.targetReps).toEqual([25, 29]);
      expect(set.asked).toEqual({ weight: 30, reps: [6, 10] });
    }
    expect(entry?.progression?.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (20 lb): about 19 more reps, to 1 in reserve.',
    );
  });

  it('is the session read, with a gym session before it', () => {
    const gymDay = record(14, 'incline-dumbbell-press', [
      [8, 30, 1],
      [8, 30, 1],
    ]);
    gymDay.entries[0]!.sets.forEach((set) => (set.targetReps = [6, 10]));
    const home = pushed(2, [27, 26, 25]);
    const next = nextIncline([home, gymDay]);
    expect(next.reference?.recordId).toBe(home.id);
    expect(next.evidence[0]).toMatch(/^Last: 20 lb × 27, 26, 25/);
  });

  it('gives the estimated max of the set it stood in for, and shows what was lifted', () => {
    const [point] = performanceHistory([pushed(2, [27, 26, 25])], incline);
    // The rules read every rep, as the push counted them: 20 lb × 27 is about 38 lb, not 28.
    expect(point?.asked?.e1rm).toBe(38);
    // Progress keeps the estimate it names (reps capped at 12), and what was lifted.
    expect(point?.e1rm).toBe(28);
    expect(point?.bestWeight).toBe(20);
    expect(point?.bestReps).toBe(27);
  });

  it('leaves sessions lifted light out of a stall, and still finds one at the gym', () => {
    const gymDay = (daysAgo: number) => {
      const day = record(daysAgo, 'incline-dumbbell-press', [
        [8, 30, 1],
        [8, 30, 1],
      ]);
      day.entries[0]!.sets.forEach((set) => (set.targetReps = [6, 10]));
      return day;
    };
    const policy = coachingPolicy(profile.experience);
    // Sessions at the light home say little about a stall at 30 lb, and a stall's remedies move
    // a load the home cannot make.
    const home = [2, 6, 9, 12, 15].map((daysAgo) => pushed(daysAgo, [27, 27]));
    expect(detectStalls(home, profile, policy)).toEqual([]);
    // The same estimated max at the gym, session after session, is still a stall.
    const mixed = [gymDay(2), pushed(4, [27, 27]), gymDay(6), gymDay(9), gymDay(12), gymDay(15)];
    expect(detectStalls(mixed, profile, policy).map((stall) => stall.exerciseId)).toContain(
      incline.id,
    );
  });

  it('shows climbing reps at the light weight as progress, not a stall', () => {
    const history = [12, 9, 6, 2].map((daysAgo, at) => pushed(daysAgo, [25 + at, 25 + at]));
    const stalls = detectStalls(history, profile, coachingPolicy(profile.experience));
    expect(stalls.filter((stall) => stall.exerciseId === incline.id)).toEqual([]);
  });

  it('is saved with the set, and an unreadable one never costs the set', () => {
    const plan = generateWorkout({
      profile,
      location: lightHome,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const entry = allEntries(plan.blocks).find((item) => item.exerciseId === incline.id);
    if (!entry) throw new Error('no incline');
    const first = entry.sets.find((set) => set.kind === 'working');
    if (!first?.asked) throw new Error('the plan pushed no set');
    const session = {
      workout: plan,
      constraints: emptyConstraints(),
      completed: {
        ...emptyCompleted(),
        startedAt: NOW,
        sets: [
          {
            entryId: entry.id,
            exerciseId: entry.exerciseId,
            setIndex: first.index,
            kind: 'working',
            reps: 26,
            weight: 20,
            rir: 1,
            completedAt: NOW,
          },
        ],
      },
    } as unknown as WorkoutSession;
    const saved = buildWorkoutRecord(session, {
      now: NOW,
      elapsedSeconds: 600,
      rating: null,
      endedEarly: true,
    });
    const logged = saved.entries.find((item) => item.entryId === entry.id)?.sets[0];
    expect(logged?.asked).toEqual({ weight: 30, reps: [6, 10] });
    const base = { kind: 'working', reps: 26, weight: 20, rir: 1 };
    expect(LoggedSetSchema.parse({ ...base, asked: first.asked }).asked).toEqual(first.asked);
    expect(LoggedSetSchema.parse({ ...base, asked: { weight: 'x' } }).asked).toBeUndefined();
    expect(LoggedSetSchema.parse({ ...base, asked: { weight: 'x' } }).reps).toBe(26);
    const planned = { ...first, asked: { reps: [6] } };
    expect(SetPrescriptionSchema.parse(planned).asked).toBeUndefined();
    expect(SetPrescriptionSchema.parse(first).asked).toEqual(first.asked);
  });
});

/** The home push day at the 20 lb dumbbells, the incline press's first working set logged. */
function startedAtLightHome(): {
  workout: GeneratedWorkout;
  completed: CompletedWork;
  lift: WorkoutEntry;
} {
  const workout = generateWorkout({
    profile,
    location: lightHome,
    history: [],
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const lift = allEntries(workout.blocks).find((entry) => entry.exerciseId === incline.id);
  if (!lift) throw new Error('no incline');
  const first = lift.sets.findIndex((set) => set.kind === 'working');
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 10 * 60,
    currentEntryId: lift.id,
    sets: lift.sets.slice(0, first + 1).map((set) => ({
      entryId: lift.id,
      exerciseId: lift.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: set.kind === 'working' ? 26 : 5,
      weight: set.targetWeight,
      rir: 1,
      completedAt: NOW,
    })),
  };
  return { workout, completed, lift };
}

function at(
  location: LocationProfile,
  workout: GeneratedWorkout,
  completed: CompletedWork,
  trigger: RecalibrationTrigger,
  loading?: { missingPlates: number[] },
): GeneratedWorkout {
  const result = recalibrate({
    trigger,
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: workout.duration.choice,
    profile: { ...profile, currentLocationId: 'home' },
    location,
    history: [],
    constraints: emptyConstraints(),
    ...(loading ? { loading } : {}),
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result.workout;
}

const entryOf = (workout: GeneratedWorkout, id: string) => {
  const found = allEntries(workout.blocks).find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
};

const toCome = (entry: WorkoutEntry, completed: CompletedWork) =>
  entry.sets.filter(
    (set) => set.kind === 'working' && !completed.sets.some((done) => done.setIndex === set.index),
  );

describe('a started lift at the heaviest weight, when the weights change', () => {
  it('takes the load it stood in for once the dumbbells make it, and goes back after', () => {
    const { workout, completed, lift } = startedAtLightHome();
    expect(lift.progression?.capped).toEqual({ at: 20 });
    const more = at(homeTo(30), workout, completed, { type: 'loading' });
    const after = entryOf(more, lift.id);
    const rest = toCome(after, completed);
    expect(rest.length).toBeGreaterThan(0);
    for (const set of rest) {
      expect(set.targetWeight).toBe(30);
      expect(set.targetReps).toEqual([6, 10]);
      expect(set.asked).toBeUndefined();
    }
    expect(after.progression?.capped).toBeUndefined();
    expect(
      after.progression?.evidence.some((line) => line.startsWith('Held at the heaviest')),
    ).toBe(false);
    // A second change, back to the light dumbbells, pushes them again.
    const back = entryOf(at(lightHome, more, completed, { type: 'loading' }), lift.id);
    for (const set of toCome(back, completed)) {
      expect(set.targetWeight).toBe(20);
      expect(set.targetReps).toEqual([25, 29]);
      expect(set.asked).toEqual({ weight: 30, reps: [6, 10] });
    }
    expect(back.progression?.capped).toEqual({ at: 20 });
    expect(back.progression?.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (20 lb): about 19 more reps, to 1 in reserve.',
    );
  });

  it('leaves a finished lift with the lines it was done with', () => {
    const { workout, completed, lift } = startedAtLightHome();
    const all: CompletedWork = {
      ...completed,
      sets: lift.sets.map((set) => ({
        entryId: lift.id,
        exerciseId: lift.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: 26,
        weight: set.targetWeight,
        rir: 1,
        completedAt: NOW,
      })),
    };
    const after = entryOf(at(homeTo(30), workout, all, { type: 'loading' }), lift.id);
    expect(after.progression).toEqual(lift.progression);
    expect(after.sets).toEqual(lift.sets);
  });

  it('leaves a lift whose weights did not change exactly as it was', () => {
    const { workout, completed } = startedAtLightHome();
    // A plate missing today changes nothing about the dumbbells.
    const same = at(lightHome, workout, completed, { type: 'loading' }, { missingPlates: [2.5] });
    for (const entry of allEntries(workout.blocks)) {
      const after = entryOf(same, entry.id);
      expect([entry.exerciseId, after.sets, after.progression]).toEqual([
        entry.exerciseId,
        entry.sets,
        entry.progression,
      ]);
    }
  });
});

describe('a lift trained once a week in rotating rep ranges', () => {
  it('still counts two misses at its heavy range three weeks apart', () => {
    const bench = requireExercise('barbell-bench-press');
    const heavy = (daysAgo: number) =>
      record(daysAgo, 'barbell-bench-press', [
        [3, 185, 1],
        [3, 185, 0],
      ]);
    const other = (daysAgo: number) =>
      record(
        daysAgo,
        'barbell-bench-press',
        [
          [10, 135, 2],
          [10, 135, 2],
        ],
        [8, 12],
        2,
      );
    const target = recommendNextTarget({
      exercise: bench,
      role: 'primary-strength',
      prescription: prescribe(bench, 'primary-strength', profile),
      history: [other(7), heavy(14), other(21), other(28), heavy(35)],
      profile,
      now: NOW,
    });
    expect(prescribe(bench, 'primary-strength', profile).reps).toEqual([4, 6]);
    expect(target.mode).toBe('deload');
  });
});

describe('back after a long break in the middle of a workout', () => {
  it('warms a chin-up up again with a few easy reps and no weight', () => {
    const workout = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'pull-arms' },
    });
    const chin = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'chin-up');
    if (!chin) throw new Error('no chin-up');
    const first = chin.sets.findIndex((set) => set.kind === 'working');
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 20 * 60,
      currentEntryId: chin.id,
      sets: chin.sets.slice(0, first + 1).map((set) => ({
        entryId: chin.id,
        exerciseId: chin.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: set.kind === 'working' ? 8 : 3,
        weight: null,
        rir: 2,
        completedAt: NOW,
      })),
    };
    const back = entryOf(
      at(gym, workout, completed, { type: 'resume', awaySeconds: 25 * 60 }),
      chin.id,
    );
    const next = back.sets.find(
      (set) => !completed.sets.some((done) => done.setIndex === set.index),
    );
    const working = back.sets.find((set) => set.kind === 'working');
    expect(next?.kind).toBe('warmup');
    expect(next?.targetWeight).toBeNull();
    expect(next?.targetReps).toEqual(easyWarmupReps(working!.targetReps));
  });
});

describe('the history notes', () => {
  const fatigueOf = (history: WorkoutRecord[]) => interpretFatigue(history, NOW, null);

  it('never compare a lift across a break', () => {
    const history = [
      record(
        2,
        'chin-up',
        [
          [8, null, 2],
          [8, null, 2],
          [7, null, 2],
        ],
        [6, 8],
        2,
      ),
      ...[35, 40].map((daysAgo) =>
        record(
          daysAgo,
          'chin-up',
          [
            [10, null, 1],
            [10, null, 1],
            [10, null, 1],
          ],
          [6, 12],
          1,
        ),
      ),
    ];
    const notes = analyzeStrategy({ history, profile, now: NOW, fatigue: fatigueOf(history) });
    expect(notes.filter((note) => note.exerciseId === 'chin-up')).toEqual([]);
  });

  it('leave out sessions the weights at a place pushed', () => {
    const history = [9, 6, 2].map((daysAgo) => pushed(daysAgo, [27, 26, 25]));
    const notes = analyzeStrategy({ history, profile, now: NOW, fatigue: fatigueOf(history) });
    expect(notes.filter((note) => note.exerciseId === incline.id)).toEqual([]);
  });
});

describe('a set pushed to its effort', () => {
  it('takes no drop set in the plan', () => {
    const allowed = { ...profile, programStyle: 'hypertrophy-focus' as ProgramStyle };
    allowed.techniques = { ...allowed.techniques, dropSets: true };
    let pushedEntries = 0;
    for (const templateId of ['push-arms', 'pull-arms', 'upper', 'full-body', 'lower']) {
      for (const duration of [15, 30, 45, 'default'] as const) {
        const plan = generateWorkout({
          profile: allowed,
          location: lightHome,
          history: [],
          now: NOW,
          duration,
          constraints: { templateId },
        });
        for (const entry of allEntries(plan.blocks)) {
          if (entryPushedToEffort(entry)) pushedEntries += 1;
          if (entry.dropSet)
            expect([entry.exerciseId, entryPushedToEffort(entry)]).toEqual([
              entry.exerciseId,
              false,
            ]);
        }
      }
    }
    expect(pushedEntries).toBeGreaterThan(0);
  });

  it('is timed at its own tempo: the reps bring the effort, not a slower lowering', () => {
    const progression = {
      mode: 'weight' as const,
      evidence: [],
      sessions: 1,
      viaFamily: false,
      confidence: 'low' as const,
      setsAdvice: 0 as const,
      capped: { at: 20 },
    };
    const pushedSet = {
      kind: 'working' as const,
      targetReps: [25, 29] as [number, number],
      targetWeight: 20,
      asked: { weight: 30, reps: [6, 10] as [number, number] },
    };
    const muscle = { role: 'primary-hypertrophy' as const, progression };
    const strength = { role: 'primary-strength' as const, progression };
    expect(
      workSecondsFor(muscle, pushedSet) -
        workSecondsFor(muscle, { ...pushedSet, asked: undefined }),
    ).toBe(27 * (REP_SECONDS.hypertrophy - REP_SECONDS.capped));
    // A strength set at the heaviest weight keeps the slower tempo.
    expect(workSecondsFor(strength, pushedSet)).toBe(
      workSecondsFor(strength, { ...pushedSet, asked: undefined }),
    );
  });
});

describe('the return line says only what it does', () => {
  const chinUp = requireExercise('chin-up');
  const chinRx = prescribe(chinUp, 'secondary-hypertrophy', profile);
  const reached: SetSpec[] = [
    [8, null, 1],
    [8, null, 1],
  ];
  const back = (daysAgo: number, rir: number, reps: [number, number] = chinRx.reps) =>
    recommendNextTarget({
      exercise: chinUp,
      role: 'secondary-hypertrophy',
      prescription: { ...chinRx, reps, rir },
      history: [record(daysAgo, 'chin-up', reached, reps, rir)],
      profile,
      now: NOW,
    });

  it('names the reserve it adds, up to four', () => {
    expect(back(45, 3)).toMatchObject({ rir: 4, mode: 'return' });
    expect(back(45, 3).evidence).toContain(
      '45 days since the last session: start at the bottom of the range, 6-8 reps, with a rep more in reserve.',
    );
    expect(back(45, 4).rir).toBe(4);
    expect(back(45, 4).evidence).toContain(
      '45 days since the last session: start at the bottom of the range, 6-8 reps.',
    );
  });

  it('calls a short range what it is', () => {
    expect(back(25, 1, [4, 6]).evidence).toContain(
      '25 days since the last session: start at 4-6 reps, with a rep more in reserve.',
    );
  });
});
