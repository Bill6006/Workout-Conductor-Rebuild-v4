import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { DUMBBELLS_KEY } from '../loading/loading';
import {
  allEntries,
  roundsRun,
  type DurationChoice,
  type GeneratedWorkout,
  type SetKind,
  type WorkoutEntry,
} from '../workout/types';
import type { RecalibrationTrigger } from '../recalibration/types';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import { emptyMaxes, recordMax } from '../progression/maxes';
import type { NextTarget } from '../progression/progression';
import {
  generateWorkout,
  leaveOutRank,
  mainLiftSets,
  scaleForDeload,
  targetAtPlace,
} from './generate';

/**
 * Maintenance 24, the owner's item 33 (docs/research/short-sessions.md). When a session too long
 * for its length must leave something out, the main lifts stay and an isolation exercise goes
 * first; one whose muscles the main lifts train goes before the day's only work for a muscle, core
 * work included, and lower-back work goes last. The minutes left bring back first what that order
 * keeps longest.
 */

const NOW = '2026-09-03T14:00:00.000Z';
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const lightHome: LocationProfile = {
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 20, step: 5 }] } },
};
const base = createDefaultProfile(NOW);
const strength: Partial<UserProfile> = { goals: { ...base.goals, primary: 'strength' } };

function plan(
  place: LocationProfile,
  templateId: string,
  duration: DurationChoice,
  overrides: Partial<UserProfile> = {},
): GeneratedWorkout {
  return generateWorkout({
    profile: { ...base, bodyweight: 185, ...overrides },
    location: place,
    history: [],
    now: NOW,
    duration,
    constraints: { templateId },
  });
}

const names = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => requireExercise(entry.exerciseId).name);
const leftOut = (workout: GeneratedWorkout) =>
  workout.explanation.fittingSteps.filter((step) => step.startsWith('Left out'));

describe('a session too long for its length', () => {
  it('keeps Chin-Up on a 30-minute pull day with light dumbbells, the isolation moves out first', () => {
    // The owner's case: the old order left Chin-Up out and kept two sets of shrugs. The rear-delt
    // fly and curl pair goes: the chin-ups train the biceps in full and the rows half, the rows give
    // the rear delts half a set a set, and the hammer curl's forearms get the least, half a set for
    // each chin-up set.
    const workout = plan(lightHome, 'pull-arms', 30);
    expect(names(workout)).toEqual(
      expect.arrayContaining(['Chest-Supported Row', 'Chin-Up', 'Hammer Curl', 'Dumbbell Shrug']),
    );
    expect(leftOut(workout)).toEqual([
      'Left out A1 Rear Delt Fly + A2 Dumbbell Curl so the session fits 30 min.',
    ]);
    expect(workout.duration.estimatedMinutes).toBeLessThanOrEqual(31);
  });

  it('keeps every press on a 30-minute push day, the pair the presses cover out first', () => {
    // Chest and triceps are the presses' own muscles; the curl is the day's only biceps work.
    const workout = plan(gym, 'push-arms', 30, strength);
    expect(names(workout)).toEqual([
      'Barbell Bench Press',
      'Incline Dumbbell Press',
      'Dumbbell Shoulder Press',
      'Lateral Raise',
      'EZ-Bar Curl',
    ]);
    expect(leftOut(workout)).toEqual([
      'Left out A1 Cable Fly + A2 Cable Triceps Pushdown so the session fits 30 min.',
    ]);
  });

  it("counts a main lift's secondary muscles at half a set", () => {
    // Chin-ups train the biceps in full and rows half; rows give the rear delts half a set a set;
    // nothing on the pull day trains triceps or traps, so the pushdown and the shrugs stay, and the
    // rear-delt fly comes back before a curl. Counted as nothing, the rear delts would keep the fly
    // in its pair and bring back the pushdown alone.
    const workout = plan(gym, 'pull-arms', 30);
    expect(leftOut(workout)).toEqual([
      'Left out Dumbbell Curl so the session fits 30 min.',
      'Left out A1 Rear Delt Fly + A2 EZ-Bar Curl so the session fits 30 min.',
    ]);
    expect(workout.explanation.fittingSteps).toContain(
      'Kept Rear Delt Fly on its own: the minutes left fit it.',
    );
    expect(names(workout)).toEqual(
      expect.arrayContaining(['Cable Triceps Pushdown', 'Barbell Shrug']),
    );
  });

  it('keeps the leg curl over the leg extension, the hamstrings counted as their lifts train them', () => {
    // The squat and the split squat train the quads in full. The hamstrings get the hinge's sets
    // in full, the split squat's at half, and nothing from the squat. Counted in full, they would
    // look better trained than the quads, and the leg extension would stay instead.
    const workout = plan(gym, 'lower', 30, {
      ...strength,
      techniques: { supersets: true, dropSets: true, circuits: false },
    });
    expect(names(workout)).toContain('Leg Curl');
    expect(names(workout)).not.toContain('Leg Extension');
  });

  it("keeps core work as the day's only work for the core, though squats brace it", () => {
    const workout = plan(gym, 'lower', 30, {
      ...strength,
      techniques: { supersets: false, dropSets: false, circuits: false },
    });
    expect(names(workout)).toContain('Ab Wheel Rollout');
    // The quads get more from the squats than the hamstrings from the hinge: the extension first.
    expect(leftOut(workout)).toEqual([
      'Left out Leg Extension to fit 30 min.',
      'Left out Leg Curl to fit 30 min.',
    ]);
  });

  it('brings back first the move the order keeps longest', () => {
    // The lateral raise is the day's only side-delt work; the rows and chin-ups train the biceps.
    const workout = plan(home, 'upper', 30);
    expect(workout.explanation.fittingSteps).toContain(
      'Kept Lateral Raise on its own: the minutes left fit it.',
    );
    expect(names(workout)).not.toContain('Dumbbell Curl');
    expect(workout.duration.estimatedMinutes).toBeLessThanOrEqual(31);
  });

  it('leaves a main lift out only once no isolation move is left', () => {
    const workout = plan(gym, 'push-arms', 15);
    expect(names(workout)).toEqual(['Barbell Bench Press', 'Incline Dumbbell Press']);
    const steps = leftOut(workout);
    expect(steps.at(-1)).toBe('Left out Dumbbell Shoulder Press so the session fits 15 min.');
    expect(steps.slice(0, -1)).toEqual([
      'Left out A1 Cable Fly + A2 Cable Triceps Pushdown to fit 15 min.',
      'Left out A1 Lateral Raise + A2 EZ-Bar Curl to fit 15 min.',
    ]);
  });

  it('lets a main lift give way, down to two exercises, for a move that fits', () => {
    // Bench press and barbell row run over 15 minutes; a chin-up in the row's place fits.
    const workout = plan(gym, 'upper', 15);
    expect(names(workout)).toEqual(['Barbell Bench Press', 'Chin-Up']);
    expect(workout.explanation.fittingSteps).toEqual(
      expect.arrayContaining([
        'Left out Barbell Row so the session fits 15 min.',
        'Kept Chin-Up on its own: the minutes left fit it.',
      ]),
    );
    expect(workout.duration.overByMinutes).toBeLessThanOrEqual(1);
    expect(workout.compromises.join(' ')).not.toMatch(/runs about/);
  });

  it('brings back a move the row cap left out when the minutes fit it', () => {
    // Dumbbells to 15 lb and a bench: nothing to hang from, and long sets at the light weights.
    const small: LocationProfile = {
      ...lightHome,
      equipment: ['adjustable-dumbbells', 'adjustable-bench'],
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 15, step: 5 }] } },
    };
    const workout = plan(small, 'pull-arms', 15);
    expect(names(workout)).toEqual(['Chest-Supported Row', 'Hammer Curl']);
    expect(workout.explanation.fittingSteps).toEqual(
      expect.arrayContaining([
        'Left out Hammer Curl to fit 15 min.',
        'Kept Hammer Curl on its own: the minutes left fit it.',
      ]),
    );
    expect(workout.duration.overByMinutes).toBeLessThanOrEqual(1);
  });

  it('tries a move in place at fewer sets, so the second press gives way to one that fits', () => {
    // Two presses at the light dumbbells run 17 minutes; a curl at two sets fits beside the first.
    const workout = plan(lightHome, 'push-arms', 15, {
      techniques: { supersets: false, dropSets: false, circuits: false },
    });
    expect(names(workout)).toEqual(['Dumbbell Bench Press', 'Dumbbell Curl']);
    const curl = allEntries(workout.blocks)[1]!;
    expect(curl.sets.filter((set) => set.kind === 'working')).toHaveLength(2);
    expect(workout.explanation.fittingSteps).toEqual(
      expect.arrayContaining([
        'Left out Incline Dumbbell Press so the session fits 15 min.',
        'Kept Dumbbell Curl on its own at 2 sets: the minutes left fit it.',
      ]),
    );
    expect(workout.duration.overByMinutes).toBeLessThanOrEqual(1);
  });

  it('brings a move back at the shortest rest the plan runs by then', () => {
    // At its first rest the curl does not fit the 30 minutes; at the plan's shortest it does.
    const workout = plan(lightHome, 'full-body', 30, {
      ...strength,
      techniques: { supersets: true, dropSets: true, circuits: false },
    });
    expect(names(workout)).toContain('Dumbbell Curl');
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'dumbbell-curl')!;
    expect(curl.restSeconds).toBe(45);
    expect(workout.explanation.fittingSteps).toContain(
      'Kept Dumbbell Curl on its own at 2 sets: the minutes left fit it.',
    );
    expect(workout.duration.overByMinutes).toBeLessThanOrEqual(1);
  });

  it('brings a move back at its own rest where the lifter runs shorter ones', () => {
    // Short rests give a finisher 35 s; brought back, it keeps them rather than the fit's 45.
    const workout = plan(home, 'pull-arms', 30, {
      restStyle: 'short',
      programStyle: 'high-rep',
      techniques: { supersets: false, dropSets: false, circuits: false },
    });
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'hammer-curl');
    expect(workout.explanation.fittingSteps).toContain(
      'Kept Hammer Curl on its own: the minutes left fit it.',
    );
    expect(curl?.restSeconds).toBe(35);
    expect(workout.duration.overByMinutes).toBeLessThanOrEqual(1);
  });

  it('never brings a move back under the sets the plan had before harder added one', () => {
    const workout = generateWorkout({
      profile: { ...base, bodyweight: 185 },
      location: gym,
      history: [],
      now: NOW,
      duration: 30,
      constraints: {
        templateId: 'push-arms',
        adjust: { sets: 1, rir: -1, restFactor: 1, loadScale: 1 },
      },
    });
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'ez-bar-curl');
    // At its three planned sets the curl does not fit: it stays out rather than come back at two.
    expect(curl?.sets.filter((set) => set.kind === 'working').length ?? 3).toBeGreaterThanOrEqual(
      3,
    );
    expect(workout.duration.overByMinutes).toBeLessThanOrEqual(1);
  });

  it("keeps a circuit's label on its rounds when the fit trims it", () => {
    const circuits = { supersets: true, dropSets: false, circuits: true };
    let trimmed = 0;
    for (const templateId of ['push-arms', 'pull-arms', 'lower', 'upper', 'full-body']) {
      for (const place of [gym, home, lightHome]) {
        for (const duration of [15, 30] as const) {
          const workout = plan(place, templateId, duration, { techniques: circuits });
          for (const block of workout.blocks.filter((each) => each.kind === 'circuit')) {
            expect(block.label.startsWith(`Circuit ×${block.rounds}:`)).toBe(true);
            if (block.rounds < 3) trimmed += 1;
          }
        }
      }
    }
    // Some circuit in these plans was trimmed under its three rounds.
    expect(trimmed).toBeGreaterThan(0);
  });

  it('changes nothing at the default length of 60 minutes', () => {
    for (const templateId of ['push-arms', 'pull-arms', 'lower', 'upper', 'full-body']) {
      for (const place of [gym, home, lightHome]) {
        expect(leftOut(plan(place, templateId, 'default'))).toEqual([]);
      }
    }
  });
});

describe('leaveOutRank', () => {
  /** The main lifts' work on each muscle, in sets. */
  const sets =
    (work: Partial<Record<MuscleId, number>>) =>
    (muscle: MuscleId): number =>
      work[muscle] ?? 0;
  const trained = sets({
    chest: 4,
    triceps: 8,
    'front-delts': 5,
    'side-delts': 1,
    abs: 2,
    quads: 7,
  });
  const custom = (overrides: Partial<CatalogExercise>): CatalogExercise => ({
    ...requireExercise('leg-extension'),
    id: 'custom-test',
    name: 'Custom move',
    ...overrides,
  });

  it('keeps a main lift longest, then lower-back work, then the only work for a muscle', () => {
    expect(leaveOutRank(requireExercise('barbell-bench-press'), trained)).toBe(3);
    expect(
      leaveOutRank(
        custom({ name: 'Back Extension', primaryMuscles: ['lower-back'], compound: false }),
        trained,
      ),
    ).toBe(2);
    expect(leaveOutRank(requireExercise('ez-bar-curl'), trained)).toBe(1);
  });

  it('ranks core work as the only work for the core, however the main lifts brace it', () => {
    expect(leaveOutRank(requireExercise('ab-wheel-rollout'), trained)).toBe(1);
  });

  it('lets a move go the sooner, the more the main lifts train its muscle', () => {
    const pushdown = leaveOutRank(requireExercise('cable-triceps-pushdown'), trained);
    const fly = leaveOutRank(requireExercise('cable-fly'), trained);
    const raise = leaveOutRank(requireExercise('lateral-raise'), trained);
    expect(pushdown).toBeCloseTo(1 / 9);
    expect(fly).toBeCloseTo(1 / 5);
    expect(raise).toBeCloseTo(1 / 2);
    expect(pushdown).toBeLessThan(fly);
    expect(fly).toBeLessThan(raise);
    expect(raise).toBeLessThan(1);
  });

  it('ranks a move by the muscle it trains that the main lifts train least', () => {
    expect(leaveOutRank(requireExercise('leg-extension'), trained)).toBeCloseTo(1 / 8);
    expect(leaveOutRank(requireExercise('leg-extension'), sets({}))).toBe(1);
    expect(leaveOutRank(custom({ primaryMuscles: ['quads', 'glutes'] }), trained)).toBe(1);
  });
});

describe("the main lifts' work on a muscle", () => {
  const entry = (exerciseId: string, working: number, extra: SetKind[] = []): WorkoutEntry => ({
    id: `e-${exerciseId}`,
    exerciseId,
    role: 'primary-strength',
    sets: [
      ...extra.filter((kind) => kind === 'warmup'),
      ...Array.from({ length: working }, () => 'working' as const),
      ...extra.filter((kind) => kind !== 'warmup'),
    ].map((kind, index) => ({
      index,
      kind,
      targetReps: [6, 10] as [number, number],
      targetRir: 2,
      targetWeight: null,
      restSeconds: 90,
    })),
    restSeconds: 90,
    warmupSets: extra.filter((kind) => kind === 'warmup').length,
    dropSet: extra.includes('drop'),
    chosenFor: [],
    locked: false,
    pinned: false,
  });
  const work = (...entries: WorkoutEntry[]) => mainLiftSets(entries, requireExercise);

  it('counts a set in full for the muscles a lift trains most, and half for the others', () => {
    // A barbell row: the upper back and lats in full, the biceps, lower back and rear delts at half.
    const row = work(entry('barbell-row', 4));
    expect(
      (['upper-back', 'lats', 'biceps', 'rear-delts', 'triceps'] as MuscleId[]).map(row),
    ).toEqual([4, 4, 2, 2, 0]);
    // The chin-up trains the biceps in full: the two add up.
    expect(work(entry('barbell-row', 4), entry('chin-up', 3))('biceps')).toBe(5);
  });

  it('counts working sets only, and only the main lifts', () => {
    expect(work(entry('barbell-bench-press', 3, ['warmup', 'warmup']))('chest')).toBe(3);
    expect(work(entry('cable-fly', 3))('chest')).toBe(0);
  });

  it('counts nothing for the hamstrings from a squat or a hip thrust, and half from a lunge', () => {
    // Squats and hip thrusts grew the hamstrings little or not at all in controlled trials (Kubo
    // et al. 2019; Plotkin et al. 2023); split squats have no such trial, so they count half.
    expect(work(entry('back-squat', 4))('hamstrings')).toBe(0);
    expect(work(entry('back-squat', 4))('lower-back')).toBe(2);
    expect(work(entry('leg-press', 3))('hamstrings')).toBe(0);
    expect(work(entry('hip-thrust', 3))('hamstrings')).toBe(0);
    expect(work(entry('bulgarian-split-squat', 3))('hamstrings')).toBe(1.5);
  });
});

describe('a circuit too long for the session', () => {
  const circuits = { supersets: true, dropSets: true, circuits: true };

  it('gives up a move at a time, the one the main lifts train most first', () => {
    // The presses train the triceps most, the chest next, and the side delts only at half a set
    // from the shoulder press: the pushdown goes, then the pair, and the lateral raise stays.
    const workout = plan(gym, 'push-arms', 30, { techniques: circuits });
    const steps = workout.explanation.fittingSteps;
    expect(steps).toContain('Ran 3 isolation moves as a 3-round circuit.');
    expect(steps.filter((step) => /^(Left out|Kept)/.test(step))).toEqual([
      'Left out Cable Triceps Pushdown from the circuit so the session fits 30 min.',
      'Left out A1 Cable Fly + A2 Lateral Raise so the session fits 30 min.',
      'Kept Lateral Raise on its own: the minutes left fit it.',
    ]);
  });

  it("stays whole while it holds the day's only work for a muscle", () => {
    // The home pull day's circuit carries the overhead triceps extension, the day's only triceps
    // work: a block ranks as its best-kept move, so the circuit stays and the hammer curl goes.
    const workout = plan(home, 'pull-arms', 30, { techniques: circuits });
    const circuit = workout.blocks.find((block) => block.kind === 'circuit');
    expect(circuit?.entries.map((entry) => entry.exerciseId)).toEqual([
      'rear-delt-fly',
      'dumbbell-curl',
      'overhead-triceps-extension',
    ]);
    expect(names(workout)).not.toContain('Hammer Curl');
  });

  it('keeps the pair it shrinks to where the time fits it', () => {
    // Ending in 25 minutes: the whole circuit went before, and one move came back at most.
    const profile = {
      ...base,
      bodyweight: 185,
      programStyle: 'high-rep' as const,
      techniques: circuits,
    };
    const workout = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const result = recalibrate({
      trigger: { type: 'end-by', time: '2026-09-03T14:25:00.000Z' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.workout.explanation.fittingSteps).toContain(
      'Left out Cable Triceps Pushdown from the circuit so the session fits 25 min.',
    );
    const pair = result.workout.blocks.find(
      (block) => block.label === 'A1 Cable Fly + A2 Lateral Raise',
    );
    expect(pair?.kind).toBe('superset');
    expect(pair?.id).toBe(`s-${pair?.entries.map((each) => each.id).join('-')}`);
    // A pair runs as many rounds as its shorter move.
    const working = (entry: WorkoutEntry) =>
      entry.sets.filter((set) => set.kind === 'working').length;
    expect(pair?.rounds).toBe(Math.min(...(pair?.entries ?? []).map(working)));
    expect(result.workout.duration.overByMinutes).toBe(0);
  });

  it('can bring back on its own a move it gave up', () => {
    // At 15 minutes with short rests the chin-up gives way in the end, and the curl the circuit
    // gave up takes its place.
    const workout = plan(gym, 'pull-arms', 15, {
      restStyle: 'short',
      programStyle: 'high-rep',
      techniques: circuits,
    });
    const steps = workout.explanation.fittingSteps;
    expect(steps).toContain('Left out EZ-Bar Curl from the circuit so the session fits 15 min.');
    expect(steps).toContain('Kept EZ-Bar Curl on its own: the minutes left fit it.');
  });
});

describe('a session shortened with a lift the fit cannot shorten', () => {
  // The bench press under way, or pinned before the start, keeps its four sets: at 15 minutes it
  // fills the time on its own, so the press after it goes rather than the session running over.
  const shortened = (
    state: 'under way' | 'pinned',
    place: LocationProfile = gym,
    templateId = 'push-arms',
    overrides: Partial<UserProfile> = {},
  ): GeneratedWorkout => {
    const workout = plan(place, templateId, 'default', overrides);
    const bench = allEntries(workout.blocks)[0]!;
    const pinned: GeneratedWorkout = {
      ...workout,
      blocks: workout.blocks.map((block) => ({
        ...block,
        entries: block.entries.map((entry) =>
          entry.id === bench.id ? { ...entry, pinned: state === 'pinned' } : entry,
        ),
      })),
    };
    const result = recalibrate({
      trigger: { type: 'duration', choice: 15 },
      workout: pinned,
      completed:
        state === 'under way'
          ? { ...emptyCompleted(), startedAt: NOW, elapsedSeconds: 180, currentEntryId: bench.id }
          : emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: state === 'under way' ? bench.id : null,
      duration: 'default',
      profile: { ...base, bodyweight: 185, ...overrides },
      location: place,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    return result.workout;
  };

  it.each(['under way', 'pinned'] as const)('keeps the bench press %s on its own', (state) => {
    const workout = shortened(state);
    expect(names(workout)).toEqual(['Barbell Bench Press']);
    expect(workout.duration.overByMinutes).toBeLessThanOrEqual(1);
  });

  it('keeps the main lift alone when a workout started at 15 minutes moves home with nothing kept', () => {
    // Four minutes in, nothing logged: the barbell bench press is not at home, so no lift is kept.
    // Two presses run over the 11 minutes left; the main lift alone fits them, and takes back the
    // set the fit trimmed from it, since the minutes are its own.
    const workout = plan(gym, 'push-arms', 15);
    for (const place of [home, lightHome]) {
      const result = recalibrate({
        trigger: { type: 'location' },
        workout,
        completed: { ...emptyCompleted(), startedAt: NOW, elapsedSeconds: 240 },
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 15,
        profile: { ...base, bodyweight: 185 },
        location: place,
        history: [],
        constraints: emptyConstraints(),
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(result.error);
      expect(names(result.workout)).toEqual(['Dumbbell Bench Press']);
      expect(result.workout.duration.overByMinutes).toBeLessThanOrEqual(1);
      const bench = allEntries(result.workout.blocks)[0]!;
      expect(bench.sets.filter((set) => set.kind === 'working')).toHaveLength(4);
      expect(result.workout.explanation.fittingSteps).toContain(
        'Gave Dumbbell Bench Press back a set: the minutes left fit it.',
      );
    }
    // Eight minutes in, the 7 minutes left do not fit the set back: it stays trimmed.
    const later = recalibrate({
      trigger: { type: 'location' },
      workout,
      completed: { ...emptyCompleted(), startedAt: NOW, elapsedSeconds: 480 },
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 15,
      profile: { ...base, bodyweight: 185 },
      location: home,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!later.ok) throw new Error(later.error);
    expect(names(later.workout)).toEqual(['Dumbbell Bench Press']);
    const trimmedBench = allEntries(later.workout.blocks)[0]!;
    expect(trimmedBench.sets.filter((set) => set.kind === 'working')).toHaveLength(3);
    expect(later.workout.duration.overByMinutes).toBeLessThanOrEqual(1);
    // Tried and taken off again at once: trimmed once, never given back.
    const steps = later.workout.explanation.fittingSteps;
    expect(
      steps.filter((step) => step === 'Trimmed one set from Dumbbell Bench Press.'),
    ).toHaveLength(1);
    expect(steps.some((step) => step.startsWith('Gave Dumbbell Bench Press back'))).toBe(false);
  });

  it('with an exact end time, gives the main lift back a set the time still fits', () => {
    const workout = plan(gym, 'push-arms', 'default');
    const result = recalibrate({
      trigger: { type: 'end-by', time: '2026-09-03T14:10:00.000Z' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: { ...base, bodyweight: 185 },
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    expect(names(result.workout)).toEqual(['Barbell Bench Press']);
    const bench = allEntries(result.workout.blocks)[0]!;
    expect(bench.sets.filter((set) => set.kind === 'working')).toHaveLength(3);
    expect(result.workout.explanation.fittingSteps).toContain(
      'Gave Barbell Bench Press back a set: the minutes left fit it.',
    );
    expect(result.workout.duration.overByMinutes).toBe(0);
  });

  it('with an exact end time, gives a set back where it sat', () => {
    /** One change on the gym push day, the bench press in front with nothing logged yet. */
    const change = (
      workout: GeneratedWorkout,
      trigger: RecalibrationTrigger,
      entry: WorkoutEntry,
    ) => {
      const result = recalibrate({
        trigger,
        workout,
        completed: {
          ...emptyCompleted(),
          startedAt: NOW,
          elapsedSeconds: 60,
          currentEntryId: entry.id,
        },
        lockedEntryIds: [],
        currentEntryId: entry.id,
        duration: 'default',
        profile: { ...base, bodyweight: 185 },
        location: gym,
        history: [],
        constraints: emptyConstraints(),
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(result.error);
      return result.workout;
    };
    const workout = plan(gym, 'push-arms', 'default');
    const bench = allEntries(workout.blocks)[0]!;
    // A ramp added by hand goes first, with the highest set number.
    const ramped = change(workout, { type: 'add-warmup', entryId: bench.id }, bench);
    const order = allEntries(ramped.blocks)[0]!.sets.map((set) => set.index);
    const ended = change(ramped, { type: 'end-by', time: '2026-09-03T14:11:00.000Z' }, bench);
    const left = allEntries(ended.blocks)[0]!;
    expect(ended.explanation.fittingSteps).toContain(
      'Gave Barbell Bench Press back a set: the minutes left fit it.',
    );
    // The sets it keeps run in the order they had: the ramps first, the added one leading.
    const kept = left.sets.map((set) => set.index);
    expect(kept).toEqual(order.filter((index) => kept.includes(index)));
    expect(left.sets[0]?.kind).toBe('warmup');
  });

  it('names the rounds an uneven circuit runs, after an exact end trims its members', () => {
    const circuits = { supersets: true, dropSets: false, circuits: true };
    const deload = { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-08T00:00:00.000Z' };
    let uneven = 0;
    for (const minutes of [20, 24, 27]) {
      const workout = generateWorkout({
        profile: { ...base, bodyweight: 185, techniques: circuits },
        location: home,
        history: [],
        now: NOW,
        duration: 30,
        constraints: { templateId: 'pull-arms', deload },
      });
      const result = recalibrate({
        trigger: {
          type: 'end-by',
          time: new Date(Date.parse(NOW) + minutes * 60_000).toISOString(),
        },
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 30,
        profile: { ...base, bodyweight: 185, techniques: circuits },
        location: home,
        history: [],
        constraints: { ...emptyConstraints(), deload },
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(result.error);
      for (const block of result.workout.blocks.filter((each) => each.kind === 'circuit')) {
        const sets = block.entries.map(
          (entry) => entry.sets.filter((set) => set.kind === 'working').length,
        );
        if (Math.min(...sets) !== Math.max(...sets)) uneven += 1;
        expect(block.rounds).toBe(roundsRun(block));
        expect(block.label.startsWith(`Circuit ×${roundsRun(block)}:`)).toBe(true);
      }
    }
    // Some circuit here ends with its members at uneven sets.
    expect(uneven).toBeGreaterThan(0);
  });

  it("keeps a circuit's rounds on the rounds it runs when a set comes off one member by hand", () => {
    const circuits = { supersets: true, dropSets: false, circuits: true };
    // The gym pull day at 30 minutes runs its fly, curl and pushdown as a circuit of 2 rounds.
    const workout = plan(gym, 'pull-arms', 30, { techniques: circuits });
    const circuit = workout.blocks.find((block) => block.kind === 'circuit');
    if (!circuit) throw new Error('no circuit');
    const member = circuit.entries[0]!;
    const result = recalibrate({
      trigger: { type: 'sets', entryId: member.id, workingDelta: -1 },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 30,
      profile: { ...base, bodyweight: 185, techniques: circuits },
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const after = result.workout.blocks.find((block) => block.id === circuit.id)!;
    const sets = after.entries.map(
      (entry) => entry.sets.filter((set) => set.kind === 'working').length,
    );
    expect(Math.min(...sets)).toBeLessThan(Math.max(...sets));
    expect(after.rounds).toBe(roundsRun(after));
    expect(after.label.startsWith(`Circuit ×${roundsRun(after)}:`)).toBe(true);
  });

  it('keeps a lift under way on its own even when it alone runs a little over', () => {
    // A goblet squat at the light dumbbells needs a little more than the 12 minutes left; a second
    // press would put the session 8 minutes over.
    const workout = shortened('under way', lightHome, 'full-body', {
      techniques: { supersets: false, dropSets: false, circuits: false },
    });
    expect(names(workout)).toEqual(['Goblet Squat']);
    expect(workout.duration.overByMinutes).toBeLessThanOrEqual(2);
  });
});

describe("a deload week's lighter loads", () => {
  const target = (weight: number) =>
    ({ weight, evidence: [] as string[] }) as unknown as Parameters<typeof scaleForDeload>[0];
  const week = { sets: -1, rir: 1, restFactor: 1, loadScale: 0.9 };

  it('say they are lighter only where the load is', () => {
    expect(scaleForDeload(target(100), week, 5)).toMatchObject({
      weight: 90,
      evidence: ['Deload week: loads 10% lighter.'],
    });
    // A tenth off 25 lb rounds back to 25: nothing lighter to say.
    expect(scaleForDeload(target(25), week, 5)).toMatchObject({ weight: 25, evidence: [] });
  });

  it('say nothing where the heaviest weight here holds the load either way', () => {
    const deload = { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-08T00:00:00.000Z' };
    const planAt = (place: LocationProfile) =>
      generateWorkout({
        profile: { ...base, bodyweight: 185 },
        location: place,
        history: [],
        now: NOW,
        duration: 'default',
        constraints: { templateId: 'push-arms', deload },
      });
    const line = (place: LocationProfile, exerciseId: string) =>
      allEntries(planAt(place).blocks)
        .find((found) => found.exerciseId === exerciseId)
        ?.progression?.evidence.includes('Deload week: loads 10% lighter.');
    // At 20 lb dumbbells the bench press holds at 20 with or without the deload.
    expect(line(lightHome, 'dumbbell-bench-press')).toBe(false);
    expect(line(gym, 'barbell-bench-press')).toBe(true);
    // "Why this workout" names lighter loads only where a lift has them.
    const week = (place: LocationProfile) =>
      planAt(place).explanation.reasons.find((reason) => reason.startsWith('Deload week'));
    expect(week(lightHome)).toMatch(/one more rep in reserve\.$/);
    expect(week(gym)).toMatch(/one more rep in reserve, loads 10% lighter\.$/);
  });

  it('keep that line current when the weights here change', () => {
    const upTo15: LocationProfile = {
      ...home,
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 15, step: 5 }] } },
    };
    const upTo60: LocationProfile = {
      ...home,
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 60, step: 5 }] } },
    };
    const deload = { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-08T00:00:00.000Z' };
    const workout = generateWorkout({
      profile: { ...base, bodyweight: 185 },
      location: upTo15,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms', deload },
    });
    const week = (reasons: string[]) => reasons.find((reason) => reason.startsWith('Deload week'));
    expect(week(workout.explanation.reasons)).toMatch(/one more rep in reserve\.$/);
    const result = recalibrate({
      trigger: { type: 'loading' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: { ...base, bodyweight: 185 },
      location: upTo60,
      history: [],
      constraints: { ...emptyConstraints(), deload },
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const lighter = allEntries(result.workout.blocks).some((entry) =>
      entry.progression?.evidence.includes('Deload week: loads 10% lighter.'),
    );
    expect(lighter).toBe(true);
    expect(week(result.workout.explanation.reasons)).toMatch(/loads 10% lighter\.$/);
  });

  it('a change to one lift says only how far over the plan runs, since no fit ran', () => {
    // Dumbbells to 30 lb: a dumbbell bench press max of 110 lb takes every lift never logged to the
    // heaviest pair at many reps, 15 minutes over the hour.
    const upTo30: LocationProfile = {
      ...home,
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 30, step: 5 }] } },
    };
    const workout = generateWorkout({
      profile: { ...base, bodyweight: 185 },
      location: upTo30,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'full-body' },
    });
    const result = recalibrate({
      trigger: { type: 'max', exerciseId: 'dumbbell-bench-press' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: { ...base, bodyweight: 185 },
      location: upTo30,
      history: [],
      constraints: emptyConstraints(),
      maxes: recordMax(emptyMaxes(), 'dumbbell-bench-press', { kind: 'max', e1rm: 110 }, 'lb', NOW),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.workout.duration.overByMinutes).toBeGreaterThan(1);
    expect(result.workout.compromises).toContain(
      `Runs about ${Math.round(result.workout.duration.overByMinutes)} min over 60 min.`,
    );
    expect(result.workout.compromises.join(' ')).not.toMatch(/Even the leanest/);
  });

  it('and when a max moves the loads', () => {
    // Dumbbells to 30 lb: the incline press lands a tenth lighter. A dumbbell bench press max of
    // 110 lb lifts every load to the heaviest weight here, where none is lighter.
    const upTo30: LocationProfile = {
      ...home,
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 30, step: 5 }] } },
    };
    const deload = { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-08T00:00:00.000Z' };
    const workout = generateWorkout({
      profile: { ...base, bodyweight: 185 },
      location: upTo30,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms', deload },
    });
    const week = (reasons: string[]) => reasons.find((reason) => reason.startsWith('Deload week'));
    expect(week(workout.explanation.reasons)).toMatch(/loads 10% lighter\.$/);
    const result = recalibrate({
      trigger: { type: 'max', exerciseId: 'dumbbell-bench-press' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: { ...base, bodyweight: 185 },
      location: upTo30,
      history: [],
      constraints: { ...emptyConstraints(), deload },
      maxes: recordMax(emptyMaxes(), 'dumbbell-bench-press', { kind: 'max', e1rm: 110 }, 'lb', NOW),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const lighter = allEntries(result.workout.blocks).some((entry) =>
      entry.progression?.evidence.includes('Deload week: loads 10% lighter.'),
    );
    expect(lighter).toBe(false);
    expect(week(result.workout.explanation.reasons)).toMatch(/one more rep in reserve\.$/);
  });

  it('are judged on the weights the place shows', () => {
    // A stack by 10 lb: 65 and a tenth off it, 58.5, both show as 60.
    const target = {
      weight: 65,
      reps: [8, 12],
      rir: 2,
      mode: 'maintain',
      evidence: [],
    } as unknown as NextTarget;
    const stack = { available: null, step: 10, cap: null, perSide: null };
    const fitted = targetAtPlace(target, week, stack, null, 'lb', 'isolation');
    expect(fitted.evidence).not.toContain('Deload week: loads 10% lighter.');
  });
});
