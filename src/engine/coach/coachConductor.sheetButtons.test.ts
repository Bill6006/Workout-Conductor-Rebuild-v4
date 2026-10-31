import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { entryAlternatives, harderAlternatives } from '../alternatives/entryAlternatives';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { SessionConstraints } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import type { CoachRoutes } from '../strategy/plateau';
import type { StrategyInsight } from '../strategy/strategy';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { gatherSignals, type CoachInput, type CoachSignal } from './coachConductor';

/**
 * Every button of the coach's that opens a lift's alternatives sheet, offered only where that
 * sheet lists something (the owner, 2026-10-31: "do not show a dead-end button"; the review of the
 * fix: the safety cards' swaps, a strategy's "Open alternatives" and the plateau route's last step
 * opened the sheet unchecked). A harder variation on the same weights only, never a lift the
 * coach's own rules keep out, and a set more only where the plan takes one. Synthetic data only.
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW) as [
  LocationProfile,
  LocationProfile,
];

const plan = (place: LocationProfile): GeneratedWorkout =>
  generateWorkout({ profile, location: place, history: [], now: NOW, duration: 'default' });

function inputFor(
  workout: GeneratedWorkout,
  place: LocationProfile,
  patch: Partial<CoachInput> = {},
): CoachInput {
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history: [],
    now: NOW,
    fatigue: interpretFatigue([], NOW),
    strategy: [],
    lastExportAt: NOW,
    workoutCount: 0,
    location: place,
    stalls: [],
    ...patch,
  };
}

/** The lift's sheet, as the lifter would open it. */
function sheetFor(input: CoachInput, entry: WorkoutEntry) {
  const block = input.workout.blocks.find((one) => one.entries.includes(entry))!;
  return entryAlternatives({
    profile: input.profile,
    location: input.location,
    workout: input.workout,
    block,
    entry,
    constraints: input.constraints,
    completed: input.completed,
    history: input.history,
    now: input.now,
  });
}

/**
 * The day's constraints with every alternative the lift's sheet lists set aside, page by page (the
 * sheet shows six), until it lists none: an empty sheet.
 */
function emptiedFor(input: CoachInput, entry: WorkoutEntry): SessionConstraints {
  let constraints = input.constraints;
  for (let page = 0; page < 40; page += 1) {
    const listed = sheetFor({ ...input, constraints }, entry).candidates.map(
      (candidate) => candidate.exercise.id,
    );
    if (listed.length === 0) return constraints;
    constraints = {
      ...constraints,
      avoidExerciseIds: [...constraints.avoidExerciseIds, ...listed],
    };
  }
  throw new Error('the sheet never emptied');
}

const bySource = (signals: CoachSignal[], source: string) =>
  signals.filter((signal) => signal.source === source);

describe('a safety card’s swap', () => {
  // A lift of the gym's plan that loads a joint, and that joint reported this session.
  const workout = plan(gym);
  const loaded = allEntries(workout.blocks).find((entry) =>
    Object.values(requireExercise(entry.exerciseId).jointStress).some(
      (stress) => stress === 'moderate' || stress === 'high',
    ),
  )!;
  const joint = (Object.entries(requireExercise(loaded.exerciseId).jointStress).find(
    ([, stress]) => stress === 'moderate' || stress === 'high',
  ) ?? [])[0] as Joint;
  const hurting = inputFor(workout, gym, {
    constraints: { ...emptyConstraints(), painJoints: [joint] },
  });

  it('opens the lift’s sheet where it lists an alternative', () => {
    const [card] = bySource(gatherSignals(hurting), 'session pain');
    expect(card?.action).toMatchObject({ kind: 'alternatives', entryId: loaded.id });
  });

  it('is no button where the sheet lists none, the card saying what to do instead', () => {
    const input = { ...hurting, constraints: emptiedFor(hurting, loaded) };
    const [card] = bySource(gatherSignals(input), 'session pain');
    expect(card?.headline).toMatch(/^Protect your /);
    expect(card?.action).toBeNull();
    expect(card?.why).toContain(
      'Nothing here swaps in for it today: skip it, or stop the set if it bites.',
    );
  });
});

describe('a strategy’s "Open alternatives"', () => {
  const workout = plan(gym);
  const lift = allEntries(workout.blocks)[0]!;
  const insight: StrategyInsight = {
    kind: 'fit',
    recommendation: 'open-alternatives',
    headline: 'Another exercise may suit you better',
    why: ['Two sessions in a row cut short.'],
    sessions: 2,
    confidence: 'medium',
    severity: 1,
    exerciseId: lift.exerciseId,
  } as StrategyInsight;
  const strategyCard = (input: CoachInput) =>
    gatherSignals(input).find((signal) => signal.source.startsWith('strategy'));

  it('opens the sheet where it lists an alternative', () => {
    const card = strategyCard(inputFor(workout, gym, { strategy: [insight] }));
    expect(card?.action).toMatchObject({ kind: 'alternatives', label: 'Open alternatives' });
  });

  it('is no button where the sheet lists none', () => {
    const input = inputFor(workout, gym, { strategy: [insight] });
    const card = strategyCard({ ...input, constraints: emptiedFor(input, lift) });
    expect(card?.action?.kind).not.toBe('alternatives');
  });
});

describe('the plateau route done', () => {
  const workout = plan(gym);
  const lift = allEntries(workout.blocks).find((entry) => entry.role === 'primary-strength')!;
  const done: CoachRoutes = {
    id: 'coach-routes',
    routes: {
      [lift.exerciseId]: {
        exerciseId: lift.exerciseId,
        step: 3,
        startedAt: NOW,
        baselineE1rm: 200,
        applied: [],
        exhausted: true,
      },
    },
  };
  const stalled = inputFor(workout, gym, {
    routes: done,
    stalls: [
      {
        exerciseId: lift.exerciseId,
        kind: 'stalled-at-effort',
        exposures: 4,
        totalExposures: 4,
        baselineE1rm: 200,
        latestE1rm: 200,
        effortMet: 4,
        effortUnknown: 0,
        firstDate: NOW,
        lastDate: NOW,
        why: ['No better estimated max in 4 exposures.'],
      },
    ],
  });

  it('offers a different exercise where the sheet lists one', () => {
    const [card] = bySource(gatherSignals(stalled), 'stall: route');
    expect(card?.action).toMatchObject({
      kind: 'alternatives',
      label: 'Pick a different exercise',
    });
  });

  it('offers none where the sheet lists none', () => {
    const input = { ...stalled, constraints: emptiedFor(stalled, lift) };
    const [card] = bySource(gatherSignals(input), 'stall: route');
    expect(card?.action).toBeNull();
  });
});

/** A lift held at `at` on its place's heaviest weights, reps at `top`. */
function heldAt(
  workout: GeneratedWorkout,
  exerciseId: string,
  at: number,
  top: number,
): GeneratedWorkout {
  return {
    ...workout,
    blocks: workout.blocks.map((block) => ({
      ...block,
      entries: block.entries.map((entry) =>
        entry.exerciseId !== exerciseId
          ? entry
          : {
              ...entry,
              sets: entry.sets.map((set) =>
                set.kind === 'working'
                  ? { ...set, targetWeight: at, targetReps: [top - 2, top] as [number, number] }
                  : set,
              ),
              progression: {
                mode: 'weight',
                sessions: 2,
                setsAdvice: 0,
                capped: { at },
                evidence: [`Held at the heaviest weight here (${at} lb): the reps go up instead.`],
                confidence: 'medium',
              } as WorkoutEntry['progression'],
            },
      ),
    })),
  };
}

/** A workout of one lift, so the coach's card is about it alone. */
function only(exerciseId: string, place: LocationProfile): GeneratedWorkout {
  const workout = plan(place);
  const template = allEntries(workout.blocks)[0]!;
  return {
    ...workout,
    blocks: [
      {
        id: 'b-one',
        kind: 'straight',
        label: `A ${exerciseId}`,
        entries: [{ ...template, id: 'e-one', exerciseId, dropSet: false, manual: undefined }],
        rounds: 3,
        restBetweenRoundsSeconds: 90,
      },
    ],
  };
}

const capped = (input: CoachInput) =>
  gatherSignals(input).find((signal) => signal.source === 'capped');

describe('a harder variation, on the same weights', () => {
  it('never counts a dumbbell or machine row as harder than a barbell row held at the plates’ heaviest', () => {
    const workout = heldAt(only('barbell-row', gym), 'barbell-row', 135, 8);
    const input = inputFor(workout, gym);
    const row = allEntries(workout.blocks)[0]!;
    const block = workout.blocks[0]!;
    const harder = harderAlternatives({
      profile,
      location: gym,
      workout,
      block,
      entry: row,
      constraints: input.constraints,
      completed: input.completed,
      history: [],
      now: NOW,
    }).map((candidate) => candidate.exercise);
    for (const exercise of harder) expect(exercise.load, exercise.id).toBe('barbell');
    const listed = sheetFor(input, row).candidates;
    expect(listed.some((candidate) => candidate.exercise.load !== 'barbell')).toBe(true);
    for (const candidate of listed) {
      if (candidate.exercise.load !== 'barbell') {
        expect(candidate.reasons, candidate.exercise.id).not.toContain(
          'still heavy with the weights you have',
        );
      }
    }
  });
});

describe('a harder variation the coach’s own rules keep out', () => {
  const workout = heldAt(only('dumbbell-row', home), 'dumbbell-row', 50, 8);

  it('is offered at home, the chest-supported row listed', () => {
    expect(capped(inputFor(workout, home))?.action).toMatchObject({ kind: 'alternatives' });
  });

  it('is not offered when that row was swapped away today', () => {
    const constraints = { ...emptyConstraints(), swappedAway: ['chest-supported-row'] };
    expect(capped(inputFor(workout, home, { constraints }))).toBeUndefined();
  });

  it('is not offered when that row is swapped out for four weeks', () => {
    const swaps = [
      {
        id: 'swap-1',
        from: 'chest-supported-row',
        to: 'dumbbell-row',
        createdAt: NOW,
        until: '2026-10-08T12:00:00.000Z',
      },
    ] as unknown as CoachInput['swaps'];
    expect(capped(inputFor(workout, home, { swaps }))).toBeUndefined();
  });
});

describe('a set more, only where the plan takes one', () => {
  const atTop = heldAt(only('dumbbell-row', home), 'dumbbell-row', 50, 20);

  it('is the lever at the top of the reps on a day of the plan', () => {
    expect(capped(inputFor(atTop, home))?.action).toMatchObject({
      kind: 'recalibrate',
      label: 'Add a set',
    });
  });

  it('gives way to the harder variation while losing fat', () => {
    const leanDown: UserProfile = { ...profile, programStyle: 'lean-down' } as UserProfile;
    const card = capped(inputFor(atTop, home, { profile: leanDown }));
    expect(card?.action).toMatchObject({ kind: 'alternatives', label: 'A harder variation' });
  });

  it('gives way to the harder variation on a day off the plan', () => {
    const constraints = {
      ...emptyConstraints(),
      catchUp: { kind: 'second' as const, muscles: [], sitOut: [] },
    };
    const card = capped(inputFor(atTop, home, { constraints }));
    expect(card?.action).toMatchObject({ kind: 'alternatives', label: 'A harder variation' });
  });
});
