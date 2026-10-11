import { describe, expect, it } from 'vitest';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { emptyDeclines, recordDecline } from '../coach/coachConductor';
import { overrideBias } from '../progression/overrides';
import { recommendNextTarget } from '../progression/progression';
import { prescribe } from '../progression/roles';
import { requireExercise } from '../../catalog/exercises/catalog';
import { declineName, learnedSections } from './learned';
import { LEARNED_RESETS_ID, emptyResets, mergeResets, parseResets, withReset } from './resets';

/**
 * Maintenance 27, the owner's item 47: what the app has learned, each value with what it is read
 * from and a reset; a reset makes each learner read only what is logged after it.
 */

const DAY = 86_400_000;
const profile = createDefaultProfile(RECORD_NOW);
const at = (days: number) => new Date(Date.parse(RECORD_NOW) - days * DAY).toISOString();
const BENCH = 'barbell-bench-press';

/** A bench session `days` ago whose first set was `weight` against a target of 185. */
function bench(days: number, weight: number, extra: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id: `w-${days}`,
    startedAt: at(days),
    completedAt: at(days),
    locationId: 'gym',
    templateId: 'push-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: BENCH,
        sets: [
          {
            kind: 'working' as const,
            reps: 5,
            weight,
            rir: 2,
            completed: true,
            targetReps: [4, 6] as [number, number],
            targetWeight: 185,
            targetRir: 2,
          },
        ],
      },
    ],
    ...extra,
  };
}

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** A reserve check on a cable curl `days` ago: `stop` reps at `judged`, `total` in all. */
function check(days: number, stop: number, judged: number, total: number): WorkoutRecord {
  return {
    ...bench(days, 185),
    id: `w-check-${days}`,
    entries: [
      {
        exerciseId: 'cable-curl',
        sets: [
          {
            kind: 'working' as const,
            reps: stop,
            weight: 40,
            rir: judged,
            completed: true,
            loggedAt: at(days),
            reserveCheck: { total, style: 'hybrid' },
          },
        ],
      },
    ],
  };
}

/** A session `days` ago of one exercise, with a pain report on it at `joint`. */
function painDay(days: number, done: string, joint?: Joint): WorkoutRecord {
  return {
    ...bench(days, 185),
    entries: [
      {
        exerciseId: done,
        sets: [{ kind: 'working' as const, reps: 8, weight: 100, rir: 2, completed: true }],
      },
    ],
    ...(joint ? { painJoints: [joint], painReports: [{ exerciseId: done, joint }] } : {}),
  };
}

const painHistory = () => [
  painDay(21, BENCH, 'shoulder'),
  painDay(17, 'dumbbell-bench-press'),
  painDay(14, BENCH, 'shoulder'),
  painDay(10, 'dumbbell-bench-press'),
  painDay(7, BENCH, 'shoulder'),
];

/** Four sessions above the suggested weight: the habit steps the target up. */
const above = [bench(12, 195), bench(9, 195), bench(5, 195), bench(2, 195)];

describe('the resets', () => {
  it('read back, a time that does not read dropped', () => {
    expect(
      parseResets({ id: LEARNED_RESETS_ID, habit: RECORD_NOW, curves: 'soon', pain: 5 }),
    ).toEqual({
      id: LEARNED_RESETS_ID,
      habit: RECORD_NOW,
    });
    expect(parseResets(null)).toEqual(emptyResets());
    expect(withReset(emptyResets(), 'reserve', RECORD_NOW)).toEqual({
      id: LEARNED_RESETS_ID,
      reserve: RECORD_NOW,
    });
  });

  it('keep a field this copy does not know, and merge two records by the later reset', () => {
    // A field a newer copy writes (pace was one until Maintenance 28 made it this copy's own).
    const newer = parseResets({ id: LEARNED_RESETS_ID, habit: RECORD_NOW, tempo: at(3) });
    expect((newer as Record<string, unknown>).tempo).toBe(at(3));
    expect(withReset(newer, 'curves', RECORD_NOW)).toEqual({
      id: LEARNED_RESETS_ID,
      habit: RECORD_NOW,
      tempo: at(3),
      curves: RECORD_NOW,
    });
    expect(
      mergeResets(
        { id: LEARNED_RESETS_ID, habit: at(5), pain: at(2) },
        { id: LEARNED_RESETS_ID, habit: at(1) },
      ),
    ).toEqual({ id: LEARNED_RESETS_ID, habit: at(1), pain: at(2) });
    expect(
      mergeResets({ id: LEARNED_RESETS_ID, habit: at(1) }, { id: LEARNED_RESETS_ID, habit: at(5) })
        .habit,
    ).toBe(at(1));
    // A field this copy never writes is the saved one's: the one shown may be older.
    const fromNewer = (tempo: string) =>
      ({ id: LEARNED_RESETS_ID, tempo }) as unknown as Parameters<typeof mergeResets>[0];
    expect((mergeResets(fromNewer(at(5)), fromNewer(at(1))) as Record<string, unknown>).tempo).toBe(
      at(5),
    );
  });
});

describe('the habit after a reset', () => {
  it('reads only sessions after it', () => {
    expect(overrideBias(above, BENCH, 5).steps).toBe(1);
    expect(overrideBias(above, BENCH, 5, at(6)).steps).toBe(0);
  });

  it("moves the lift's target only before it", () => {
    const exercise = requireExercise(BENCH);
    const input = {
      exercise,
      role: 'primary-strength' as const,
      prescription: prescribe(exercise, 'primary-strength', profile),
      history: above,
      profile,
      now: RECORD_NOW,
    };
    const habit = (target: ReturnType<typeof recommendNextTarget>) =>
      target.evidence.some((line) => line.endsWith('the target steps up to meet you.'));
    expect(habit(recommendNextTarget(input))).toBe(true);
    expect(habit(recommendNextTarget({ ...input, resets: { habit: at(1) } }))).toBe(false);
  });
});

describe('the page', () => {
  const sections = (history: WorkoutRecord[], resets = emptyResets(), declines = emptyDeclines()) =>
    learnedSections({ history, profile, now: RECORD_NOW, resets, declines });
  const section = (list: ReturnType<typeof sections>, key: string) =>
    list.find((one) => one.key === key)!;

  it('lists every learned value in the agreed order, pace first, nothing learned yet', () => {
    const list = sections([]);
    expect(list.map((one) => one.key)).toEqual([
      'pace',
      'habit',
      'curves',
      'reserve',
      'pain',
      'declines',
    ]);
    // The pace learns from Maintenance 28 on (item 4), with its own reset.
    expect(section(list, 'pace').status).toBe(
      'Nothing learned yet: it reads each finished workout from this version on.',
    );
    for (const one of list.filter((item) => item.key !== 'declines')) {
      expect(one.reset).not.toBeNull();
      expect(one.evidence.length).toBeGreaterThan(40);
    }
  });

  it('names a lift with a habit, and none after its reset', () => {
    const habit = section(sections(above), 'habit');
    expect(habit.status).toBe('Learned on 1 lift.');
    expect(habit.items).toEqual([
      'Barbell Bench Press: above the suggested weight in 4 of your last 4 sessions, so its target steps up to meet you.',
    ]);
    const reset = section(sections(above, withReset(emptyResets(), 'habit', at(1))), 'habit');
    expect(reset.items).toEqual([]);
    expect(reset.resetAt).toBe(at(1));
  });

  it('names a pain pattern, observational, and none after its reset', () => {
    const report = (days: number, done: string, joint?: Joint): WorkoutRecord => ({
      ...bench(days, 185),
      entries: [
        {
          exerciseId: done,
          sets: [{ kind: 'working' as const, reps: 8, weight: 100, rir: 2, completed: true }],
        },
      ],
      ...(joint ? { painJoints: [joint], painReports: [{ exerciseId: done, joint }] } : {}),
    });
    const history = [
      report(21, BENCH, 'shoulder'),
      report(17, 'dumbbell-bench-press'),
      report(14, BENCH, 'shoulder'),
      report(10, 'dumbbell-bench-press'),
      report(7, BENCH, 'shoulder'),
    ];
    const pain = section(sections(history), 'pain');
    expect(pain.status).toBe('1 pattern in what you logged, not a diagnosis.');
    expect(pain.items).toEqual([
      'Shoulder pain with Barbell Bench Press in 3 of 3 sessions, not with Dumbbell Bench Press in 2.',
    ]);
    expect(
      section(sections(history, withReset(emptyResets(), 'pain', at(15))), 'pain').items,
    ).toEqual([]);
  });

  it('lists declined offers by name, and how long each stays away', () => {
    let declines = recordDecline(
      emptyDeclines(),
      { source: 'extra set', exerciseId: BENCH },
      at(2),
    );
    declines = recordDecline(declines, { source: 'schedule move' }, at(30));
    declines = recordDecline(declines, { source: 'schedule move' }, at(20));
    const list = section(sections([], emptyResets(), declines), 'declines');
    expect(list.items).toEqual([
      expect.stringMatching(
        /^An extra set on Barbell Bench Press: declined [A-Z][a-z]{2} \d+: back from [A-Z][a-z]{2} \d+\.$/,
      ),
      'Moving the schedule: declined twice: it stays away.',
    ]);
    expect(list.reset).toBe('Clear them');
  });

  it('says what the reserve is read as only while the checks are on', () => {
    const four = [5, 12, 19, 26].map((days) => check(days, 12, 1, 15));
    const on = { ...profile, reserveCheck: true };
    const reserve = (history: WorkoutRecord[], who = on, resets = emptyResets()) =>
      learnedSections({
        history,
        profile: who,
        now: RECORD_NOW,
        resets,
        declines: emptyDeclines(),
      }).find((one) => one.key === 'reserve')!;
    expect(reserve(four).items).toContainEqual(
      expect.stringMatching(/, the reserve you log is read as 2 more\.$/),
    );
    const off = reserve(four, { ...profile, reserveCheck: false });
    expect(off.items.some((item) => item.includes('is read as'))).toBe(false);
    expect(off.items).toContain(
      'Reserve checks are off, so it is not used and nothing new is learned.',
    );
    // Off with two checks: what there is, and that nothing is read, never "still learning".
    const fewOff = reserve(four.slice(0, 2), { ...profile, reserveCheck: false });
    expect(fewOff.status).toBe('Reserve checks are off: nothing is read through your 2 checks.');
    expect(fewOff.items.some((item) => item.startsWith('Reserve checks are off'))).toBe(false);
    // Why nothing is read: too few checks, checks that scatter, or a reset since the last one.
    expect(reserve(four.slice(0, 2)).status).toBe('Still learning: 2 checks of the 4 it needs.');
    const scattered = [
      check(5, 12, 1, 12),
      check(12, 12, 1, 18),
      check(19, 12, 1, 12),
      check(26, 12, 1, 18),
    ];
    expect(reserve(scattered).status).toBe(
      'Not settled: your 4 checks scatter by more than 2 reps, so nothing is read through them yet.',
    );
    expect(reserve(four, on, withReset(emptyResets(), 'reserve', at(1))).status).toBe(
      `Nothing learned since you reset it on ${shortDay(at(1))}.`,
    );
  });

  it('says the learning started again when the style changed', () => {
    const four = [5, 12, 19, 26].map((days) => check(days, 12, 1, 15));
    const changed = { ...profile, reserveCheck: true, programStyle: 'strength-focus' as const };
    const reserve = learnedSections({
      history: four,
      profile: changed,
      now: RECORD_NOW,
      resets: emptyResets(),
      declines: emptyDeclines(),
    }).find((one) => one.key === 'reserve')!;
    expect(reserve.status).toBe(
      'Nothing learned since your style changed: the checks start again under this one.',
    );
  });

  it('names every offer by what it offered, never by the source the coach gave it', () => {
    const sources = [
      'extra set',
      'weekly coverage',
      'capped',
      'schedule move',
      'style: undulating',
      'style: goals',
      'variety: flat',
      'stall: route',
      'stall: undershooting',
      'fewer reps',
      'progression',
      'drop-set opportunity',
      'in-session reps',
      'fatigue',
      'backup age',
      'unfinished workout',
      'rating pain',
      'session pain',
      'profile limitations',
      'strategy: fit',
      'an offer from a newer copy',
    ];
    const names = sources.map((source) => declineName(`${source}|${BENCH}`));
    for (const [index, name] of names.entries()) {
      const source = sources[index]!;
      const raw = `${source.charAt(0).toUpperCase()}${source.slice(1)} on Barbell Bench Press`;
      expect(name, source).not.toContain(':');
      expect(name, source).not.toBe(raw);
      expect(name, source).toMatch(/^[A-Z].* on Barbell Bench Press$/);
    }
    // Each known offer has its own name; one from a newer copy is "An offer".
    expect(new Set(names.slice(0, -1)).size).toBe(sources.length - 1);
    expect(names.at(-1)).toBe('An offer on Barbell Bench Press');
  });

  it('lists a pain pattern put away until a new report, and not once a new one came', () => {
    const declines = recordDecline(
      emptyDeclines(),
      { source: `pain pattern|${BENCH}|shoulder|${at(7)}`, exerciseId: BENCH },
      at(6),
    );
    expect(section(sections(painHistory(), emptyResets(), declines), 'declines').items).toEqual([
      expect.stringMatching(
        /^A pain pattern at the shoulder on Barbell Bench Press: declined [A-Z][a-z]{2} \d+: back with a new report\.$/,
      ),
    ]);
    // A new report makes a new pattern: the old Not now keeps nothing away.
    const newer = [...painHistory(), painDay(2, BENCH, 'shoulder')];
    expect(section(sections(newer, emptyResets(), declines), 'declines').items).toEqual([]);
  });

  it('reads an offer whose source holds a bar', () => {
    expect(declineName(`pain pattern|${BENCH}|shoulder|${RECORD_NOW}|${BENCH}`)).toBe(
      'A pain pattern at the shoulder on Barbell Bench Press',
    );
    expect(declineName(`push: review|${RECORD_NOW}|1|${BENCH}`)).toBe(
      'The twelve-week review of the lift to push on Barbell Bench Press',
    );
    expect(declineName('weekly coverage|*')).toBe('Sets for a muscle behind its week');
  });
});
