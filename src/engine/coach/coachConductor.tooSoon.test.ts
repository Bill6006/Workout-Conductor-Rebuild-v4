import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { localWeekKey } from '../../core/time/localDate';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { CompletedWork } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  COACH_SHOWN_ID,
  TOO_SOON_SOURCE,
  conductCoach,
  declineKey,
  emptyDeclines,
  gatherSignals,
  recordDecline,
  recordShown,
  type CoachInput,
  type CoachSignal,
} from './coachConductor';

/**
 * Maintenance 33, the owner's decisions 2 and 5 (docs/proposals/week-model-readiness-time.md;
 * docs/research/recovery-time-course.md): "too soon" fires only for hard planned work well inside a
 * muscle's window, or when the first set confirms it; a warning with a one-tap lighter option, never
 * a block; light work never flagged; "Not now" skips that muscle for the week; new cards at most one
 * a day and three a week. Synthetic data only.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const HOUR = 1 / 24;

const benchAt = (daysAgo: number, first: SetSpec, rir = 2): WorkoutRecord => ({
  ...record(
    daysAgo,
    'barbell-bench-press',
    [first, [8, 100, rir], [8, 100, rir], [8, 100, rir]],
    [6, 10],
    rir,
  ),
  id: `bench-${daysAgo}`,
});

function input(
  history: WorkoutRecord[],
  options: Partial<CoachInput> & { workout?: GeneratedWorkout } = {},
): CoachInput {
  const workout =
    options.workout ??
    generateWorkout({
      profile,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: RECORD_NOW,
    fatigue: interpretFatigue(history, RECORD_NOW),
    strategy: [],
    lastExportAt: RECORD_NOW,
    workoutCount: history.length,
    ...options,
  };
}

const tooSoon = (coach: CoachInput): CoachSignal[] =>
  gatherSignals(coach).filter((signal) => signal.source.startsWith(`${TOO_SOON_SOURCE}|`));
/** The chest's card: the bench press works the chest and the triceps, each a card of its own. */
const chestCard = (coach: CoachInput) =>
  tooSoon(coach).find((signal) => signal.source.startsWith(`${TOO_SOON_SOURCE}|chest|`));

/** Chest worked hard yesterday afternoon: four bench sets a rep short of failure, 20 h ago. */
const hardYesterday = () => [benchAt(20 * HOUR, [8, 100, 1], 1)];

describe('"too soon" for hard planned work well inside the window', () => {
  it('warns of the chest, with the lighter option a tap away', () => {
    const coach = input(hardYesterday());
    // The triceps the bench press works directly have a card of their own.
    expect(
      tooSoon(coach)
        .map((signal) => signal.source.split('|')[1])
        .sort(),
    ).toEqual(['chest', 'triceps']);
    const card = chestCard(coach);
    expect(card).toMatchObject({
      domain: 'recovery',
      headline: 'The chest may not have recovered',
      action: { kind: 'recalibrate', trigger: { type: 'lighter', muscle: 'chest' } },
      untilNew: true,
    });
    expect(card!.why[0]).toBe(
      'Worked hard 20 h ago; about 36 h to recover (sets one rep short of failure: 36 h).',
    );
    expect(card!.source).toBe(`${TOO_SOON_SOURCE}|chest|${localWeekKey(RECORD_NOW)}`);
    // A "too soon" card is the one the coach shows: nothing outranks it on a plain day.
    expect(conductCoach(coach)?.signal.source).toMatch(/^too-soon\|(chest|triceps)\|/);
  });

  it('never for light work, nor past three quarters of the window', () => {
    // Four sets at 3 in reserve: about 24 h, and 20 h is past three quarters of it.
    expect(tooSoon(input([benchAt(20 * HOUR, [8, 100, 3], 3)]))).toEqual([]);
    // Two days later the chest is recovered.
    expect(tooSoon(input([benchAt(2, [8, 100, 1], 1)]))).toEqual([]);
  });

  it('goes once the lifter takes the lighter option, and for the week with Not now', () => {
    const coach = input(hardYesterday());
    const card = chestCard(coach)!;
    expect(
      chestCard({ ...coach, constraints: { ...emptyConstraints(), lighter: ['chest'] } }),
    ).toBeUndefined();
    const declines = recordDecline(emptyDeclines(), card, RECORD_NOW);
    expect(conductCoach({ ...coach, declines })?.signal.source ?? '').not.toBe(card.source);
    // Next week the same muscle's card is a new one.
    const later = new Date(Date.parse(RECORD_NOW) + 7 * 86_400_000).toISOString();
    const nextWeek = input([benchAt(20 * HOUR - 7, [8, 100, 1], 1)], { now: later, declines });
    expect(localWeekKey(later)).not.toBe(localWeekKey(RECORD_NOW));
    expect(chestCard(nextWeek)?.source).toBe(`${TOO_SOON_SOURCE}|chest|${localWeekKey(later)}`);
  });
});

describe('"too soon" when the first set confirms it', () => {
  // Each set asked the load it was lifted at, as a saved session's do.
  const asked = (done: WorkoutRecord): WorkoutRecord => ({
    ...done,
    entries: done.entries.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set) => ({ ...set, targetWeight: 100 })),
    })),
  });
  // Three rested sessions, then a hard one 30 h ago: inside the chest's 36 h, past three quarters.
  const history = [
    benchAt(14, [8, 100, 2]),
    benchAt(10, [8, 100, 2]),
    benchAt(6, [8, 100, 2]),
    benchAt(30 * HOUR, [8, 100, 1], 1),
  ].map(asked);
  /**
   * Today's plan with the bench press as its first lift (the plan itself rotates to the close grip),
   * asking what the rested sessions asked, or the load and reserve given.
   */
  const benchDay = (load = 100, reserve = 2) => {
    const coach = input(history);
    const workout = structuredClone(coach.workout);
    const bench = allEntries(workout.blocks)[0]!;
    bench.exerciseId = 'barbell-bench-press';
    for (const set of bench.sets) {
      if (set.kind !== 'working') continue;
      set.targetWeight = load;
      set.targetReps = [6, 10];
      set.targetRir = reserve;
    }
    return { ...coach, workout };
  };
  const firstSet = (coach: CoachInput, reps: number, weight: number, rir = 2): CompletedWork => {
    const bench = allEntries(coach.workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    )!;
    const set = bench.sets.find((each) => each.kind === 'working')!;
    return {
      startedAt: RECORD_NOW,
      elapsedSeconds: 600,
      currentEntryId: bench.id,
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps,
          weight,
          rir,
          completedAt: RECORD_NOW,
        },
      ],
    };
  };

  it('a first set 10% under the rested sessions inside the window warns, saying so', () => {
    const coach = benchDay();
    expect(tooSoon(coach)).toEqual([]);
    const active = { ...coach, status: 'active' as const, completed: firstSet(coach, 8, 90) };
    const card = chestCard(active);
    expect(card?.headline).toBe('The chest may not have recovered');
    expect(card?.why).toContain(
      'Your first Barbell Bench Press set read 10% under your rested sessions.',
    );
  });

  it('says the hours when the first set was lifted', () => {
    // Logged three hours ago: 27 h after the hard session, inside its 36 h; now it is 30 h.
    const coach = benchDay();
    const logged = firstSet(coach, 8, 90);
    const earlier = new Date(Date.parse(RECORD_NOW) - 3 * 3_600_000).toISOString();
    const completed = {
      ...logged,
      sets: logged.sets.map((set) => ({ ...set, completedAt: earlier })),
    };
    const card = chestCard({ ...coach, status: 'active' as const, completed });
    expect(card?.why[0]).toMatch(
      /^Worked hard 27 h before your first Barbell Bench Press set; about 36 h to recover/,
    );
  });

  it('one 5% under is ordinary variation: nothing', () => {
    const coach = benchDay();
    const active = { ...coach, status: 'active' as const, completed: firstSet(coach, 8, 95) };
    expect(tooSoon(active)).toEqual([]);
  });

  // The first review of Maintenance 33: a deload's first set lifted as asked read 11% under.
  it('one the plan asked less of, lifted as asked: nothing', () => {
    const coach = benchDay(85, 3);
    const active = { ...coach, status: 'active' as const, completed: firstSet(coach, 6, 85, 3) };
    expect(tooSoon(active)).toEqual([]);
  });

  it('one well short of a lighter ask still warns', () => {
    // Three reps at 85 on 6-10 asked at 3 in reserve, logged at 2: 85 x (1 + 5 / 30) against
    // 85 x (1 + 9 / 30), 10% short.
    const coach = benchDay(85, 3);
    const active = { ...coach, status: 'active' as const, completed: firstSet(coach, 3, 85) };
    expect(chestCard(active)?.why).toContain(
      'Your first Barbell Bench Press set read 10% under your rested sessions.',
    );
  });
});

describe('the card limits: one new card a day, three a week', () => {
  const shownAt = (entries: [string, string][]) => ({
    id: COACH_SHOWN_ID as typeof COACH_SHOWN_ID,
    shown: Object.fromEntries(entries),
  });
  const week = localWeekKey(RECORD_NOW);
  const other = (muscle: string) => `${TOO_SOON_SOURCE}|${muscle}|${week}|*`;
  const day = (daysAgo: number) =>
    new Date(Date.parse(RECORD_NOW) - daysAgo * 86_400_000).toISOString();

  it('a new card waits when one was first shown today', () => {
    const coach = input(hardYesterday(), { shown: shownAt([[other('quads'), RECORD_NOW]]) });
    expect(tooSoon(coach)).toHaveLength(2);
    expect(conductCoach(coach)?.signal.source ?? '').not.toMatch(/^too-soon\|/);
  });

  it('three this week hold back a fourth; one already seen shows on', () => {
    // RECORD_NOW is a Thursday: Monday to Wednesday are this week.
    expect([1, 2, 3].map((daysAgo) => localWeekKey(day(daysAgo)))).toEqual([week, week, week]);
    const three = shownAt([
      [other('quads'), day(1)],
      [other('lats'), day(2)],
      [other('hamstrings'), day(3)],
    ]);
    const coach = input(hardYesterday(), { shown: three });
    expect(conductCoach(coach)?.signal.source ?? '').not.toMatch(/^too-soon\|/);
    // The chest's card itself seen before: it shows on.
    const card = chestCard(coach)!;
    const seen = recordShown(three, card, day(1));
    expect(seen.shown[declineKey(card)]).toBe(day(1));
    expect(conductCoach({ ...coach, shown: seen })?.signal.source).toBe(card.source);
  });

  it('a card shown yesterday leaves room for a new one today', () => {
    const coach = input(hardYesterday(), { shown: shownAt([[other('quads'), day(1)]]) });
    expect(conductCoach(coach)?.signal.source).toMatch(/^too-soon\|/);
  });
});
