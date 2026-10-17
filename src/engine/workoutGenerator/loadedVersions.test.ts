import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { allEntries } from '../workout/types';
import { accessoryPicker, generateWorkout, pickAccessoryFor } from './generate';
import {
  LOAD_SHIFT,
  lastDoneHere,
  loadedVersionLine,
  loadedVersionShift,
  outgrownMoves,
  swapBackCovers,
  waitsForBodyweight,
  withSwapsBack,
  type OutgrownBy,
} from './loadedVersions';

/**
 * Maintenance 30, the owner's item 31: a bodyweight move keeps its place while bodyweight fits its
 * reps; once a set at bodyweight goes a rep past the top of its range at the planned reserve, or a
 * weight is added to it, its loaded version takes the place where the place has one, and "Why this
 * workout" says so at the change. A calf raise on two legs is loaded wherever a loaded version is.
 */

const BSS = 'bulgarian-split-squat';
const DB_BSS = 'dumbbell-bulgarian-split-squat';
const CALF = 'standing-calf-raise';
const PRESS_CALF = 'leg-press-calf-raise';

/** A split squat workout: its range 8-12 at 2 in reserve, as the plan asks. */
const splitSquat = (daysAgo: number, sets: SetSpec[], extra: Partial<WorkoutRecord> = {}) =>
  record(daysAgo, BSS, sets, [8, 12], 2, extra);
/** The outgrown moves, as pairs, for comparing. */
const read = (history: WorkoutRecord[]) => [...outgrownMoves(history)];
const none = new Map<string, OutgrownBy>();
const away = new Set<string>();

describe('a bodyweight move outgrown', () => {
  it('is one whose set at bodyweight went a rep past the top of its range at the planned reserve', () => {
    expect(read([splitSquat(2, [[13, null, 2]])])).toEqual([[BSS, 'reps']]);
    expect(read([splitSquat(2, [[12, null, 2]])])).toEqual([]);
    // One set past it is enough; the others may fall back as the lifter tires.
    expect(
      read([
        splitSquat(2, [
          [13, null, 2],
          [11, null, 1],
        ]),
      ]),
    ).toEqual([[BSS, 'reps']]);
  });

  it('counts the reps left in reserve past the plan’s', () => {
    expect(read([splitSquat(2, [[11, null, 4]])])).toEqual([[BSS, 'reps']]);
    expect(read([splitSquat(2, [[11, null, 3]])])).toEqual([]);
  });

  it('reads a set with no reserve logged as taken to failure', () => {
    expect(read([splitSquat(2, [[14, null, null]])])).toEqual([]);
    expect(read([splitSquat(2, [[15, null, null]])])).toEqual([[BSS, 'reps']]);
  });

  it('is one the lifter added a weight to: bodyweight alone was too light', () => {
    expect(read([splitSquat(2, [[10, 25, 2]])])).toEqual([[BSS, 'weight']]);
    // Reps past the top at bodyweight say more than the weight held in the same workout.
    expect(
      read([
        splitSquat(2, [
          [14, null, 2],
          [10, 25, 2],
        ]),
      ]),
    ).toEqual([[BSS, 'reps']]);
  });

  it('stays outgrown through sets inside the range, as a plan stops them at its top', () => {
    const past = splitSquat(21, [[14, null, 2]]);
    // At a hotel with no dumbbells, the split squat at bodyweight done just as planned.
    const hotel = splitSquat(
      2,
      [
        [12, null, 2],
        [12, null, 2],
      ],
      { locationId: 'travel' },
    );
    expect(read([past, hotel])).toEqual([[BSS, 'reps']]);
    // In any order the records come.
    expect(read([hotel, past])).toEqual([[BSS, 'reps']]);
  });

  it('comes back only when no set at bodyweight reached the bottom of its range', () => {
    const past = splitSquat(9, [[14, null, 2]]);
    expect(read([past, splitSquat(2, [[6, null, 2]])])).toEqual([]);
    // Read in the order they were done, whatever order they come in.
    expect(read([splitSquat(2, [[6, null, 2]]), past])).toEqual([]);
    expect(read([past, splitSquat(2, [[8, null, 2]])])).toEqual([[BSS, 'reps']]);
    // Outgrown again after that.
    expect(read([past, splitSquat(4, [[6, null, 2]]), splitSquat(2, [[13, null, 2]])])).toEqual([
      [BSS, 'reps'],
    ]);
  });

  it('reads the catalog’s range where a set has none, and the planned reserve as 2', () => {
    const bare = (reps: number): WorkoutRecord => {
      const saved = record(2, 'reverse-lunge', [[reps, null, 2]]);
      const [entry] = saved.entries;
      return {
        ...saved,
        entries: [
          {
            ...entry!,
            sets: entry!.sets.map((set) => ({
              ...set,
              targetReps: undefined,
              targetRir: undefined,
            })),
          },
        ],
      };
    };
    // Reverse Lunge, 8-15.
    expect(read([bare(16)])).toEqual([['reverse-lunge', 'reps']]);
    expect(read([bare(15)])).toEqual([]);
  });

  it('counts only working sets done', () => {
    const saved = splitSquat(2, [[20, null, 2]]);
    const [entry] = saved.entries;
    const warmup = {
      ...entry!,
      sets: entry!.sets.map((set) => ({ ...set, kind: 'warmup' as const })),
    };
    const undone = { ...entry!, sets: entry!.sets.map((set) => ({ ...set, completed: false })) };
    expect(read([{ ...saved, entries: [warmup] }])).toEqual([]);
    expect(read([{ ...saved, entries: [undone] }])).toEqual([]);
  });

  it('is never a move with no loaded version', () => {
    expect(read([record(2, 'push-up', [[40, null, 2]], [8, 15])])).toEqual([]);
  });
});

describe('the rule among a slot’s candidates', () => {
  const both = new Set([BSS, DB_BSS]);
  const outgrown = new Map<string, OutgrownBy>([[BSS, 'reps']]);
  it('keeps the bodyweight move until it is outgrown, then the loaded one', () => {
    expect(loadedVersionShift({ id: BSS }, both, none)).toBe(0);
    expect(waitsForBodyweight({ id: DB_BSS }, none)).toBe(true);
    expect(loadedVersionShift({ id: BSS }, both, outgrown)).toBe(-LOAD_SHIFT);
    expect(waitsForBodyweight({ id: DB_BSS }, outgrown)).toBe(false);
    // A loaded version is never moved: it waits, or competes as itself.
    expect(loadedVersionShift({ id: DB_BSS }, both, none)).toBe(0);
    expect(loadedVersionShift({ id: DB_BSS }, both, outgrown)).toBe(0);
  });

  it('moves a bodyweight move only where a loaded version is a candidate', () => {
    expect(loadedVersionShift({ id: BSS }, new Set([BSS]), outgrown)).toBe(0);
    expect(loadedVersionShift({ id: 'leg-press' }, both, outgrown)).toBe(0);
  });

  it('holds a loaded version back until its bodyweight move loads, wherever that move is', () => {
    // The split squat out of the running (disliked, swapped away, in another slot): its loaded
    // version still waits until it is outgrown, as no candidate at all.
    expect(waitsForBodyweight({ id: DB_BSS }, none)).toBe(true);
    expect(waitsForBodyweight({ id: DB_BSS }, outgrown)).toBe(false);
    expect(waitsForBodyweight({ id: DB_BSS }, outgrown, new Set([BSS]))).toBe(true);
    // Never a move that is no loaded version.
    expect(waitsForBodyweight({ id: BSS }, none)).toBe(false);
    expect(waitsForBodyweight({ id: 'leg-press' }, none)).toBe(false);
  });

  it('never holds back a loaded version the lifter chose', () => {
    // A favourite, a kept swap's own exercise, the lift to push: the caller names them.
    expect(waitsForBodyweight({ id: DB_BSS }, none, away, new Set([DB_BSS]))).toBe(false);
    expect(waitsForBodyweight({ id: DB_BSS }, none, new Set([BSS]), new Set([DB_BSS]))).toBe(false);
    expect(waitsForBodyweight({ id: DB_BSS }, none, away, new Set([BSS]))).toBe(true);
  });

  it('loads a calf raise on two legs wherever a loaded one is, with no history', () => {
    const calves = new Set([CALF, PRESS_CALF]);
    expect(loadedVersionShift({ id: CALF }, calves, none)).toBe(-LOAD_SHIFT);
    expect(waitsForBodyweight({ id: PRESS_CALF }, none)).toBe(false);
    expect(loadedVersionShift({ id: CALF }, new Set([CALF]), none)).toBe(0);
  });

  it('leaves a bodyweight move the lifter swapped away from as the plan’s own pick', () => {
    const swapped = new Set([BSS]);
    expect(loadedVersionShift({ id: BSS }, both, outgrown, swapped)).toBe(0);
    expect(waitsForBodyweight({ id: DB_BSS }, outgrown, swapped)).toBe(true);
    expect(
      loadedVersionShift({ id: CALF }, new Set([CALF, PRESS_CALF]), none, new Set([CALF])),
    ).toBe(0);
  });
});

describe('a kept swap back to a bodyweight move (the seventh and eighth re-checks)', () => {
  const swap = (from: string, to: string) => ({ from, to, setAt: RECORD_NOW });

  it('stands for every loaded version of the move', () => {
    expect(withSwapsBack([swap('standing-calf-raise-machine', CALF)])).toEqual([
      swap('standing-calf-raise-machine', CALF),
      swap(PRESS_CALF, CALF),
    ]);
  });

  it('puts a swap kept from another of those loaded versions first, the swap back after it', () => {
    // The lifter's own swap applies wherever its exercise fits; the swap back covers it elsewhere.
    const own = swap(PRESS_CALF, 'custom-smith-calf-raise');
    expect(withSwapsBack([swap('standing-calf-raise-machine', CALF), own])).toEqual([
      swap('standing-calf-raise-machine', CALF),
      own,
      swap(PRESS_CALF, CALF),
    ]);
  });

  it('never covers a favourite', () => {
    expect(
      withSwapsBack([swap('standing-calf-raise-machine', CALF)], new Set([PRESS_CALF])),
    ).toEqual([swap('standing-calf-raise-machine', CALF)]);
  });

  it('covers every loaded version of its move, for keeping the plan’s own pick to end it', () => {
    const back = swap('standing-calf-raise-machine', CALF);
    expect(swapBackCovers(back, PRESS_CALF)).toBe(true);
    expect(swapBackCovers(back, 'standing-calf-raise-machine')).toBe(true);
    expect(swapBackCovers(back, DB_BSS)).toBe(false);
    expect(swapBackCovers(swap('dumbbell-reverse-lunge', BSS), DB_BSS)).toBe(false);
  });

  it('never covers a favourite but its own', () => {
    const back = swap('standing-calf-raise-machine', CALF);
    expect(swapBackCovers(back, PRESS_CALF, new Set([PRESS_CALF]))).toBe(false);
    const machine = new Set(['standing-calf-raise-machine']);
    expect(swapBackCovers(back, 'standing-calf-raise-machine', machine)).toBe(true);
  });

  it('is only from one of the move’s own loaded versions', () => {
    const across = swap('dumbbell-reverse-lunge', BSS);
    expect(withSwapsBack([across])).toEqual([across]);
  });
});

describe('what "Why this workout" says of it', () => {
  const at = (by: OutgrownBy) => new Map<string, OutgrownBy>([[BSS, by]]);
  const noneHere = new Map<string, 'bodyweight' | 'loaded'>();

  it('names the move and why, at the change', () => {
    expect(loadedVersionLine(DB_BSS, at('reps'), away, noneHere)).toBe(
      'Dumbbell Bulgarian Split Squat in place of the Bulgarian Split Squat: at bodyweight you went past the top of its reps, so it is loaded now.',
    );
    expect(loadedVersionLine(DB_BSS, at('weight'), away, noneHere)).toBe(
      'Dumbbell Bulgarian Split Squat in place of the Bulgarian Split Squat: you added a weight to it, so it is loaded now.',
    );
    expect(loadedVersionLine(PRESS_CALF, none, away, noneHere)).toBe(
      'Leg Press Calf Raise in place of the Standing Calf Raise: on two legs, bodyweight is too light for its reps.',
    );
  });

  it('says it until the loaded version is done at this place', () => {
    expect(
      loadedVersionLine(DB_BSS, at('reps'), away, new Map([[BSS, 'bodyweight' as const]])),
    ).not.toBeNull();
    expect(
      loadedVersionLine(DB_BSS, at('reps'), away, new Map([[BSS, 'loaded' as const]])),
    ).toBeNull();
  });

  it('says nothing of a loaded version the rule does not hold in place', () => {
    expect(loadedVersionLine(DB_BSS, none, away, noneHere)).toBeNull();
    expect(loadedVersionLine(BSS, at('reps'), away, noneHere)).toBeNull();
    expect(loadedVersionLine('leg-press', at('reps'), away, noneHere)).toBeNull();
    expect(loadedVersionLine(DB_BSS, at('reps'), new Set([BSS]), noneHere)).toBeNull();
  });

  it('reads which was done last at this place, the loaded one in a workout with both', () => {
    const history = [
      record(9, PRESS_CALF, [[15, 140, 2]], [12, 20]),
      record(7, CALF, [[20, null, 2]], [12, 20], 2, { locationId: 'home' }),
      record(5, BSS, [[10, null, 2]], [8, 12]),
      record(3, DB_BSS, [[10, 30, 2]], [8, 12], 2, { startedAt: '2026-09-07T12:00:00.000Z' }),
    ];
    const both: WorkoutRecord = {
      ...record(1, BSS, [[10, null, 2]], [8, 12]),
      entries: [
        ...record(1, BSS, [[10, null, 2]], [8, 12]).entries,
        ...record(1, DB_BSS, [[10, 30, 2]], [8, 12]).entries,
      ],
    };
    expect([...lastDoneHere(history, 'gym')].sort()).toEqual([
      [BSS, 'loaded'],
      [CALF, 'loaded'],
    ]);
    expect([...lastDoneHere(history, 'home')]).toEqual([[CALF, 'bodyweight']]);
    expect([...lastDoneHere([both], 'gym')]).toEqual([[BSS, 'loaded']]);
    expect([...lastDoneHere(history, null)]).toEqual([]);
  });
});

describe('the plan at a place', () => {
  const [home, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
  const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    ...createDefaultProfile(RECORD_NOW),
    bodyweight: 185,
    ...overrides,
  });
  const lower = (
    history: WorkoutRecord[],
    place = gym!,
    overrides: Partial<UserProfile> = {},
    swaps: { from: string; to: string }[] = [],
  ) => {
    const workout = generateWorkout({
      profile: profile(overrides),
      location: place,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: {
        templateId: 'lower',
        swaps: swaps.map((swap) => ({
          ...swap,
          setAt: RECORD_NOW,
          until: '2026-12-01T00:00:00.000Z',
        })),
      },
    });
    return {
      ids: allEntries(workout.blocks).map((entry) => entry.exerciseId),
      entries: allEntries(workout.blocks),
      reasons: workout.explanation.reasons,
    };
  };
  const inPlaceOf = (reasons: string[], name: string) =>
    reasons.filter((line) => line.includes(`in place of the ${name}`));
  const outgrown = [
    splitSquat(3, [
      [14, null, 2],
      [13, null, 2],
    ]),
  ];

  it('keeps the split squat at bodyweight while it fits, and loads the calf raise at the gym', () => {
    const { ids, reasons } = lower([]);
    expect(ids).toContain(BSS);
    expect(ids).not.toContain(DB_BSS);
    expect(ids).not.toContain(CALF);
    expect(ids.some((id) => id === PRESS_CALF || id === 'standing-calf-raise-machine')).toBe(true);
    expect(inPlaceOf(reasons, 'Bulgarian Split Squat')).toEqual([]);
    expect(inPlaceOf(reasons, 'Standing Calf Raise')).toHaveLength(1);
  });

  it('takes the dumbbell split squat once the bodyweight one is outgrown, and says why', () => {
    const { ids, reasons } = lower(outgrown);
    expect(ids).toContain(DB_BSS);
    expect(ids).not.toContain(BSS);
    expect(reasons).toContain(
      'Dumbbell Bulgarian Split Squat in place of the Bulgarian Split Squat: at bodyweight you went past the top of its reps, so it is loaded now.',
    );
  });

  it('keeps the dumbbell split squat once done here, and stops saying why', () => {
    const { ids, reasons } = lower([...outgrown, record(1, DB_BSS, [[10, 30, 2]], [8, 12])]);
    expect(ids).toContain(DB_BSS);
    expect(inPlaceOf(reasons, 'Bulgarian Split Squat')).toEqual([]);
  });

  it('keeps it through a hotel’s bodyweight split squats done as planned', () => {
    const history = [
      splitSquat(21, [[14, null, 2]]),
      record(10, DB_BSS, [[12, 30, 2]], [8, 12], 2),
      record(5, DB_BSS, [[12, 35, 2]], [8, 12], 2),
      splitSquat(
        2,
        [
          [12, null, 2],
          [12, null, 2],
        ],
        { locationId: 'travel' },
      ),
    ];
    const { ids, reasons } = lower(history);
    expect(ids).toContain(DB_BSS);
    expect(ids).not.toContain(BSS);
    // Done here last: nothing new to say at the gym.
    expect(inPlaceOf(reasons, 'Bulgarian Split Squat')).toEqual([]);
  });

  it('does the same at home with dumbbells and a bench; a calf raise there stays at bodyweight', () => {
    expect(lower(outgrown, home!).ids).toContain(DB_BSS);
    const fresh = lower([], home!);
    expect(fresh.ids).toContain(BSS);
    expect(fresh.ids).toContain(CALF);
    expect(fresh.reasons.some((line) => line.includes('in place of the'))).toBe(false);
  });

  it('loads a calf raise the lifter added a weight to, where the place has a loaded one', () => {
    const held = [
      record(
        3,
        CALF,
        [
          [15, 45, 2],
          [14, 45, 2],
        ],
        [12, 20],
        2,
      ),
    ];
    const atGym = lower(held);
    expect(atGym.ids).not.toContain(CALF);
    expect(atGym.reasons).toContain(
      `${atGym.ids.includes(PRESS_CALF) ? 'Leg Press Calf Raise' : 'Standing Calf Raise Machine'} in place of the Standing Calf Raise: you added a weight to it, so it is loaded now.`,
    );
    // At home, with none, it stays, its weight carried forward as before (Maintenance 21).
    const atHome = lower(
      held.map((saved) => ({ ...saved, locationId: 'home' })),
      home!,
    );
    const calf = atHome.entries.find((entry) => entry.exerciseId === CALF);
    expect(calf).toBeDefined();
    const working = calf!.sets.filter((set) => set.kind === 'working');
    expect(working.every((set) => (set.targetWeight ?? 0) > 0)).toBe(true);
  });

  it('keeps a bodyweight move the lifter prefers', () => {
    const preferred = lower(outgrown, gym!, {
      exercisePreferences: {
        ...profile().exercisePreferences,
        preferred: ['Bulgarian Split Squat'],
      },
    });
    expect(preferred.ids).toContain(BSS);
    expect(inPlaceOf(preferred.reasons, 'Bulgarian Split Squat')).toEqual([]);
  });

  it('keeps a swap back to bodyweight, and a swap away from it, over the loaded version', () => {
    expect(lower(outgrown, gym!, {}, [{ from: DB_BSS, to: BSS }]).ids).toContain(BSS);
    // Away from the split squat, for the reverse lunge: the swap stands, loaded or not.
    const away = lower(outgrown, gym!, {}, [{ from: BSS, to: 'reverse-lunge' }]);
    expect(away.ids).toContain('reverse-lunge');
    expect(away.ids).not.toContain(DB_BSS);
    expect(away.ids).not.toContain(BSS);
    expect(away.reasons).toContain(
      'Reverse Lunge in place of Bulgarian Split Squat, the swap you chose to keep.',
    );
    expect(inPlaceOf(away.reasons, 'Bulgarian Split Squat')).toEqual([]);
  });

  it('says one thing of an entry a kept swap put in', () => {
    const { ids, reasons } = lower([], gym!, {}, [
      { from: PRESS_CALF, to: 'standing-calf-raise-machine' },
    ]);
    expect(ids).toContain('standing-calf-raise-machine');
    expect(
      reasons.filter((line) => line.startsWith('Standing Calf Raise Machine in place of')),
    ).toEqual([
      'Standing Calf Raise Machine in place of Leg Press Calf Raise, the swap you chose to keep.',
    ]);
  });

  it('never plans the loaded version of a move the lifter dislikes, before it was outgrown', () => {
    const dislikes = {
      exercisePreferences: {
        ...profile().exercisePreferences,
        disliked: ['Bulgarian Split Squat'],
      },
    };
    expect(lower([], gym!, dislikes).ids).not.toContain(DB_BSS);
    expect(lower([], home!, dislikes).ids).not.toContain(DB_BSS);
  });

  it('says nothing of a bodyweight move the lifter could not do here', () => {
    const { reasons } = lower([], gym!, {
      exercisePreferences: {
        ...profile().exercisePreferences,
        disliked: ['Standing Calf Raise'],
      },
    });
    expect(inPlaceOf(reasons, 'Standing Calf Raise')).toEqual([]);
  });

  it('says it once at the gym for a lifter who does the calf raise at home between', () => {
    const history = [
      record(9, PRESS_CALF, [[15, 140, 2]], [12, 20], 2),
      record(7, CALF, [[20, null, 2]], [12, 20], 2, { locationId: 'home' }),
      record(5, PRESS_CALF, [[15, 140, 2]], [12, 20], 2),
      record(2, CALF, [[20, null, 2]], [12, 20], 2, { locationId: 'home' }),
    ];
    const { ids, reasons } = lower(history);
    expect(ids).toContain(PRESS_CALF);
    expect(inPlaceOf(reasons, 'Standing Calf Raise')).toEqual([]);
  });

  it('gives the coach’s extra calf work a loaded calf raise at the gym, and reads what is outgrown', () => {
    const picker = accessoryPicker({
      profile: profile(),
      location: gym!,
      history: outgrown,
      now: RECORD_NOW,
    });
    expect([...(picker.outgrown ?? [])]).toEqual([[BSS, 'reps']]);
    const calves = pickAccessoryFor('calves', [], picker);
    expect(calves?.id).toBeDefined();
    expect(calves?.id).not.toBe(CALF);
    const atHome = pickAccessoryFor(
      'calves',
      [],
      accessoryPicker({ profile: profile(), location: home!, history: [], now: RECORD_NOW }),
    );
    expect(atHome?.id).toBe(CALF);
  });

  it('keeps the loaded version a lifter swapped the bodyweight move for', () => {
    const picker = accessoryPicker({
      profile: profile(),
      location: gym!,
      history: [],
      now: RECORD_NOW,
      swaps: [{ from: BSS, to: DB_BSS, setAt: RECORD_NOW, until: '2026-12-01T00:00:00.000Z' }],
    });
    expect(picker.excluded?.has(BSS)).toBe(true);
    expect(picker.excluded?.has(DB_BSS)).toBe(false);
    expect(lower([], gym!, {}, [{ from: BSS, to: DB_BSS }]).ids).toContain(DB_BSS);
  });

  it('plans a favourite loaded version beside a kept swap away from its bodyweight move (re-check)', () => {
    // A swap away from the split squat, kept since before round L; the dumbbell one a favourite now.
    const swaps = [{ from: BSS, to: 'reverse-lunge' }];
    const favourite = {
      exercisePreferences: {
        ...profile().exercisePreferences,
        preferred: ['Dumbbell Bulgarian Split Squat'],
      },
    };
    expect(lower(outgrown, gym!, favourite, swaps).ids).toContain(DB_BSS);
    const picker = accessoryPicker({
      profile: profile(favourite),
      location: gym!,
      history: outgrown,
      now: RECORD_NOW,
      swaps: swaps.map((swap) => ({
        ...swap,
        setAt: RECORD_NOW,
        until: '2026-12-01T00:00:00.000Z',
      })),
    });
    // The swap keeps the split squat out, not its loaded version.
    expect(picker.excluded?.has(BSS)).toBe(true);
    expect(picker.excluded?.has(DB_BSS)).toBe(false);
  });

  // The fourth re-check: a loaded version waits outright, unless the lifter chose it.
  it('plans a favourite loaded version before its bodyweight move is outgrown', () => {
    const favourite = {
      exercisePreferences: {
        ...profile().exercisePreferences,
        preferred: ['Dumbbell Bulgarian Split Squat'],
      },
    };
    const { ids, reasons } = lower([], gym!, favourite);
    expect(ids).toContain(DB_BSS);
    expect(ids).not.toContain(BSS);
    // A favourite, not the rule: nothing said of a change.
    expect(inPlaceOf(reasons, 'Bulgarian Split Squat')).toEqual([]);
  });

  it('keeps the calf machine a lifter swapped the bodyweight calf raise for, and says so', () => {
    // The leg-press calf raise is the plan's own loaded calf raise at the gym: the swap still puts
    // in the machine the lifter chose, never the plan's pick in its place.
    const { ids, reasons } = lower([], gym!, {}, [
      { from: CALF, to: 'standing-calf-raise-machine' },
    ]);
    expect(ids).toContain('standing-calf-raise-machine');
    expect(ids).not.toContain(PRESS_CALF);
    expect(reasons).toContain(
      'Standing Calf Raise Machine in place of Standing Calf Raise, the swap you chose to keep.',
    );
  });

  it('says the swap of an outgrown move for its own loaded version is the lifter’s', () => {
    const { ids, reasons } = lower(outgrown, gym!, {}, [{ from: BSS, to: DB_BSS }]);
    expect(ids).toContain(DB_BSS);
    expect(reasons).toContain(
      'Dumbbell Bulgarian Split Squat in place of Bulgarian Split Squat, the swap you chose to keep.',
    );
  });

  it('applies a kept swap away from a lift to push that is a loaded version', () => {
    const push = {
      pushLift: { exerciseId: DB_BSS, target: 100, units: 'lb' as const, since: RECORD_NOW },
    };
    // The lift to push is the slot's own pick, so its swap applies, never left for the split squat.
    const { ids, reasons } = lower([], gym!, push, [{ from: DB_BSS, to: 'reverse-lunge' }]);
    expect(ids).toContain('reverse-lunge');
    expect(ids).not.toContain(BSS);
    expect(reasons).toContain(
      'Reverse Lunge in place of Dumbbell Bulgarian Split Squat, the swap you chose to keep.',
    );
  });

  it('pauses the lift to push in a deload week: a loaded one waits, and a swap away from its move applies', () => {
    // The push on the dumbbell split squat, a swap away from the split squat kept: in a deload
    // week the push stands down, so the loaded split squat waits like any loaded version, and the
    // swap takes the movement away as it always does.
    const workout = generateWorkout({
      profile: profile({
        pushLift: { exerciseId: DB_BSS, target: 100, units: 'lb', since: RECORD_NOW },
      }),
      location: gym!,
      history: [],
      now: RECORD_NOW,
      duration: 'default',
      constraints: {
        templateId: 'lower',
        deload: { startsAt: '2026-09-07T00:00:00.000Z', endsAt: '2026-09-14T00:00:00.000Z' },
        swaps: [
          { from: BSS, to: 'reverse-lunge', setAt: RECORD_NOW, until: '2026-12-01T00:00:00.000Z' },
        ],
      },
    });
    const ids = allEntries(workout.blocks).map((entry) => entry.exerciseId);
    expect(ids).toContain('reverse-lunge');
    expect(ids).not.toContain(DB_BSS);
    expect(workout.explanation.reasons).toContain(
      'Reverse Lunge in place of Bulgarian Split Squat, the swap you chose to keep.',
    );
  });
});
