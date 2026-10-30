import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { CatchUpSpec } from '../planning/catchUp';
import { allEntries } from '../workout/types';
import { generateWorkout, sameOffer, sessionDose } from './generate';
import { describeWorkout } from '../../test/clockDays';
import { RECORD_NOW, record } from '../../test/records';

/**
 * Maintenance 31, items 12 and 32: a catch-up and a second workout are built from the muscles their
 * spec names alone, each muscle's own slot, its sets and its reserve.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...createDefaultProfile(RECORD_NOW, 'gym'),
  bodyweight: 185,
  ...overrides,
});
const build = (
  catchUp: CatchUpSpec,
  overrides: Partial<UserProfile> = {},
  extra: { excludeExerciseIds?: string[] } = {},
) =>
  generateWorkout({
    profile: profile(overrides),
    location: gym!,
    history: [],
    now: RECORD_NOW,
    duration: 'default',
    constraints: { catchUp, ...extra },
  });
const working = (entry: ReturnType<typeof allEntries>[number]) =>
  entry.sets.filter((set) => set.kind === 'working');

describe('a catch-up session', () => {
  const spec: CatchUpSpec = {
    kind: 'catch-up',
    muscles: [
      { muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' },
      { muscle: 'chest', sets: 2, minRir: 1, why: 'behind' },
    ],
    sitOut: [],
  };

  it('holds each muscle’s own lift, the strength lift first', () => {
    const workout = build(spec);
    expect(workout.templateId).toBe('catch-up');
    expect(workout.title).toBe('Catch-up');
    const entries = allEntries(workout.blocks);
    expect(entries).toHaveLength(2);
    expect(requireExercise(entries[0]!.exerciseId).movementPattern).toBe('horizontal-push');
    expect(requireExercise(entries[1]!.exerciseId).movementPattern).toBe('shoulder-abduction');
  });

  it('gives each its sets, never more than its role’s, and none to failure', () => {
    const entries = allEntries(build(spec).blocks);
    expect(working(entries[0]!)).toHaveLength(2);
    expect(working(entries[1]!)).toHaveLength(3);
    expect(entries.flatMap(working).every((set) => set.targetRir >= 1)).toBe(true);
  });

  it('says what it is for', () => {
    expect(build(spec).explanation.reasons[0]).toBe(
      'A catch-up for what this week still lacks: side delts and chest, a few sets each and none to failure.',
    );
  });

  it('gives a muscle the next slot that carries it once its own is out', () => {
    // The squat gives the glutes their sets and every hinge works the glutes: the hamstrings take
    // the leg curl (the second review of round M; before, they had no lift).
    const behind = (muscle: 'glutes' | 'hamstrings') =>
      ({ muscle, sets: 3, minRir: 1, why: 'behind' }) as const;
    const workout = build({
      kind: 'catch-up',
      muscles: [behind('glutes'), behind('hamstrings')],
      sitOut: [],
    });
    const sets = (muscle: 'glutes' | 'hamstrings') =>
      allEntries(workout.blocks)
        .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes(muscle))
        .reduce((sum, entry) => sum + working(entry).length, 0);
    expect(sets('hamstrings')).toBe(3);
    expect(sets('glutes')).toBeLessThanOrEqual(3);
    expect(workout.explanation.reasons[0]).toContain('glutes and hamstrings');
  });

  it('gives muscles that share a slot one lift, at the fewest sets either asks', () => {
    // The glutes ride with the squat: one squat for the quads and the glutes, never two, and never
    // more sets than the glutes lack (the review of round M).
    const workout = build({
      kind: 'catch-up',
      muscles: [
        { muscle: 'quads', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'glutes', sets: 2, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    });
    const entries = allEntries(workout.blocks);
    expect(entries).toHaveLength(1);
    expect(requireExercise(entries[0]!.exerciseId).movementPattern).toBe('squat');
    expect(working(entries[0]!)).toHaveLength(2);
  });

  it('adds no extra session of a lift to push, nor speaks of one', () => {
    const workout = build(spec, {
      pushLift: { exerciseId: 'barbell-row', target: 225, units: 'lb', since: RECORD_NOW },
    });
    expect(allEntries(workout.blocks).map((entry) => entry.exerciseId)).not.toContain(
      'barbell-row',
    );
    expect(workout.explanation.reasons.some((line) => /Barbell Row/.test(line))).toBe(false);
  });

  it('weighs no extra session of the lift to push, nor speaks of one', () => {
    // Twenty-four sets for the lats this week: on a planned day the extra row would wait, "No extra
    // Barbell Row today: … at the weekly cap". A catch-up weighs no extra at all.
    const pulldowns = [3, 4, 5].map((daysAgo) =>
      record(
        daysAgo,
        'lat-pulldown',
        Array.from({ length: 8 }, () => [10, 120, 2] as [number, number, number]),
        [8, 12],
        2,
      ),
    );
    const workout = generateWorkout({
      profile: profile({
        pushLift: { exerciseId: 'barbell-row', target: 225, units: 'lb', since: RECORD_NOW },
      }),
      location: gym!,
      history: pulldowns,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    expect(workout.explanation.reasons.filter((line) => line.includes('Barbell Row'))).toEqual([]);
  });

  it('plans as usual with no muscles to catch up', () => {
    const workout = build({ kind: 'catch-up', muscles: [], sitOut: [] });
    expect(workout.templateId).not.toBe('catch-up');
    expect(workout.explanation.reasons.some((line) => line.startsWith('A catch-up'))).toBe(false);
  });
});

describe('a second workout the same day', () => {
  const spec: CatchUpSpec = {
    kind: 'second',
    muscles: [
      { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
      { muscle: 'quads', sets: 2, minRir: 3, why: 'remainder' },
    ],
    sitOut: ['hamstrings'],
  };

  it('leads with what was missed, and gives what is left of today’s three or more in reserve', () => {
    const workout = build(spec);
    expect(workout.templateId).toBe('second-workout');
    expect(workout.title).toBe('Second workout');
    const entries = allEntries(workout.blocks);
    const squat = entries.find(
      (entry) => requireExercise(entry.exerciseId).movementPattern === 'squat',
    );
    expect(squat).toBeDefined();
    expect(working(squat!)).toHaveLength(2);
    expect(working(squat!).every((set) => set.targetRir >= 3)).toBe(true);
  });

  it('says so, and names what sits out', () => {
    const reasons = build(spec).explanation.reasons;
    expect(reasons.slice(0, 3)).toEqual([
      'A second workout today: it leads with what you missed, chest.',
      'Quads take only what is left of one session, three or more reps short of failure.',
      'Hamstrings, trained today, sit out.',
    ]);
  });
});

describe('a muscle’s usual sets in one session', () => {
  it('is the most a template of the split gives the slots that train it', () => {
    // The lower day: the squat's 4, the lunge's 3 and the leg extension's 3.
    expect(sessionDose(profile(), 'quads')).toBe(10);
    // Push + arms: the bench press's 4 and the fly's 3.
    expect(sessionDose(profile(), 'chest')).toBe(7);
  });

  it('follows the style: Foundation plans fewer', () => {
    expect(sessionDose(profile({ programStyle: 'foundation' }), 'quads')).toBeLessThan(10);
  });
});

describe('a catch-up’s lifts, the third review of round M', () => {
  const behind = (
    muscle: 'forearms' | 'biceps' | 'glutes' | 'quads' | 'chest' | 'triceps',
    sets: number,
  ) => ({ muscle, sets, minRir: 1, why: 'behind' }) as const;
  const works = (workout: ReturnType<typeof build>, muscle: 'forearms' | 'glutes') =>
    allEntries(workout.blocks).some((entry) =>
      requireExercise(entry.exerciseId).primaryMuscles.includes(muscle),
    );

  it('the forearms take a lift that works them, one curl with the biceps', () => {
    const workout = build({
      kind: 'catch-up',
      muscles: [behind('forearms', 2), behind('biceps', 3)],
      sitOut: [],
    });
    // Before: "ez-bar-curl x2" alone, a curl for the biceps.
    expect(works(workout, 'forearms'), describeWorkout(workout).join('; ')).toBe(true);
    expect(workout.explanation.reasons[0]).toContain('forearms and biceps');
  });

  const glutesCases: [string, Partial<UserProfile>][] = [
    [
      'a favourite front squat',
      { exercisePreferences: { preferred: ['Front Squat'], disliked: [] } },
    ],
    [
      'barbell squats avoided',
      { limitations: { ...profile().limitations, avoidBarbellSquats: true } },
    ],
  ];
  for (const [why, overrides] of glutesCases) {
    it(`the glutes take a lift that works them, ${why}`, () => {
      const workout = build(
        { kind: 'catch-up', muscles: [behind('glutes', 3)], sitOut: [] },
        overrides,
      );
      expect(workout.templateId).toBe('catch-up');
      // Before: a front squat or a hack squat x3, for the quads alone.
      expect(works(workout, 'glutes'), describeWorkout(workout).join('; ')).toBe(true);
      expect(workout.explanation.reasons[0]).toContain('glutes');
    });
  }

  it('muscles sharing a slot share its lift, ahead of a favourite for one: one squat for both', () => {
    const workout = build(
      { kind: 'catch-up', muscles: [behind('quads', 3), behind('glutes', 2)], sitOut: [] },
      { exercisePreferences: { preferred: ['Front Squat'], disliked: [] } },
    );
    const entries = allEntries(workout.blocks);
    // Each muscle in a slot of its own, the favourite front squat takes the quads' 3 sets and a
    // hinge the glutes': one squat at the fewer sets either is short is the rule (round M).
    expect(entries, describeWorkout(workout).join('; ')).toHaveLength(1);
    const [squat] = entries;
    expect(requireExercise(squat!.exerciseId).primaryMuscles).toEqual(
      expect.arrayContaining(['quads', 'glutes']),
    );
    expect(working(squat!)).toHaveLength(2);
  });

  it('each muscle takes a lift of its own where no lift works both: a wrist curl, then a curl', () => {
    const workout = build(
      { kind: 'catch-up', muscles: [behind('forearms', 2), behind('biceps', 3)], sitOut: [] },
      {},
      { excludeExerciseIds: ['hammer-curl', 'reverse-curl'] },
    );
    const lifts = describeWorkout(workout).join('; ');
    // Before: the biceps shared the forearms' slot, and its curl worked the biceps alone.
    expect(works(workout, 'forearms'), lifts).toBe(true);
    const curls = allEntries(workout.blocks).filter((entry) =>
      requireExercise(entry.exerciseId).primaryMuscles.includes('biceps'),
    );
    expect(
      curls.reduce((sum, entry) => sum + working(entry).length, 0),
      lifts,
    ).toBe(3);
  });

  it('a lift goes in for the day’s muscles alone: the squat for the glutes, not the quads', () => {
    const workout = build({ kind: 'catch-up', muscles: [behind('glutes', 3)], sitOut: [] });
    expect(allEntries(workout.blocks).map((entry) => entry.chosenFor)).toEqual([['glutes']]);
  });

  it('one set left waits, through another muscle’s lift too: the front delts’ press spares the triceps', () => {
    const workout = build({
      kind: 'catch-up',
      muscles: [
        behind('chest', 2),
        behind('triceps', 3),
        { ...behind('chest', 3), muscle: 'front-delts' },
      ],
      sitOut: [],
    });
    const lifts = describeWorkout(workout).join('; ');
    // The bench press leaves the triceps 1 set: an overhead press would take it, at 1 set.
    expect(
      allEntries(workout.blocks).filter((entry) => working(entry).length < 2),
      lifts,
    ).toEqual([]);
    const triceps = allEntries(workout.blocks)
      .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes('triceps'))
      .reduce((sum, entry) => sum + working(entry).length, 0);
    expect(triceps, lifts).toBeLessThanOrEqual(3);
  });

  it('gives no lift a single working set: one set left waits for the week', () => {
    const workout = build({
      kind: 'catch-up',
      muscles: [behind('chest', 2), behind('triceps', 3)],
      sitOut: [],
    });
    // Before: "barbell-bench-press x2; cable-triceps-pushdown x1", the triceps' last set.
    expect(
      allEntries(workout.blocks).filter((entry) => working(entry).length < 2),
      describeWorkout(workout).join('; '),
    ).toEqual([]);
  });
});

describe('the day’s offers compared, the third review of round M', () => {
  const chestAndTriceps: CatchUpSpec = {
    kind: 'catch-up',
    muscles: [
      { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
      { muscle: 'triceps', sets: 2, minRir: 1, why: 'behind' },
    ],
    sitOut: [],
  };

  it('are the same for the same muscles in the same order, whatever their sets', () => {
    const fewer = {
      ...chestAndTriceps,
      muscles: chestAndTriceps.muscles.map((item) => ({ ...item, sets: 2 })),
    };
    expect(sameOffer({ catchUp: chestAndTriceps }, { catchUp: fewer })).toBe(true);
  });

  it('differ for other muscles, or a second workout for a catch-up', () => {
    const lats = {
      ...chestAndTriceps,
      muscles: [{ muscle: 'lats' as const, sets: 3, minRir: 1, why: 'behind' as const }],
    };
    expect(sameOffer({ catchUp: chestAndTriceps }, { catchUp: lats })).toBe(false);
    expect(
      sameOffer({ catchUp: chestAndTriceps }, { catchUp: { ...chestAndTriceps, kind: 'second' } }),
    ).toBe(false);
    expect(sameOffer({ catchUp: chestAndTriceps }, {})).toBe(false);
  });

  it('are the split’s own day with the full session taken, or a catch-up with nothing behind', () => {
    expect(sameOffer({ catchUp: chestAndTriceps, fullSession: true }, {})).toBe(true);
    expect(sameOffer({ catchUp: { ...chestAndTriceps, muscles: [] } }, { catchUp: null })).toBe(
      true,
    );
  });
});
