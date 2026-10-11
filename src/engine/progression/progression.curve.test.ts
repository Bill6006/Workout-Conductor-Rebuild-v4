import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { PERSONAL_CURVE, curveLoad, liftCurve, ruleLoad } from './personalCurve';
import { recommendNextTarget } from './progression';
import { withReadReserve } from './reserveCheck';
import { prescribe } from './roles';

/**
 * Maintenance 27, the owner's item 41: a lift's own reps-to-weight curve, once item 43's sets to
 * failure pin it down, turns the last session's best set into a return after a break or a new rep
 * range; everywhere else the rule everyone gets stands.
 */

const curl = requireExercise('cable-curl');
const profile = createDefaultProfile(RECORD_NOW);
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.parse(RECORD_NOW) - daysAgo * DAY).toISOString();

/**
 * A session of cable curls: its first set logged as an ordinary set of `reps`, its last a reserve
 * check of `total` reps to failure, both at `weight`.
 */
function session(
  daysAgo: number,
  weight: number,
  reps: number,
  total: number,
  index: number,
  range: [number, number] = [10, 15],
): WorkoutRecord {
  const when = at(daysAgo);
  const set = (setIndex: number, setReps: number, check: boolean) => ({
    kind: 'working' as const,
    reps: setReps,
    weight,
    rir: 1,
    completed: true,
    setIndex,
    targetReps: range,
    targetRir: 1,
    loggedAt: when,
    ...(check ? { reserveCheck: { total } } : {}),
  });
  return {
    id: `w-curl-${index}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'pull-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: curl.id,
        plannedSets: 2,
        sets: [set(0, reps, false), set(1, Math.max(1, total - 2), true)],
      },
    ],
  };
}

/**
 * Six weekly sessions on a lifter whose own constant is 14 (far fewer reps at a share of the max
 * than most), alternating 8 and 16 reps to failure, the newest `newest` days ago.
 */
function lowCurve(newest: number): WorkoutRecord[] {
  const k = 14;
  // Heavy enough that the curve's change outlasts the stack's ten-pound step.
  const max = 300;
  // The newest session at the heavier load: its best set sits under the twelve reps the rule reads
  // to, so the curve has something to say about a return to more reps.
  return [16, 8, 16, 8, 16, 8].map((total, index) => {
    const weight = Math.round((max / (1 + total / k)) * 2) / 2;
    return session(newest + 7 * (5 - index), weight, Math.max(1, total - 1), total, index);
  });
}

/**
 * The same lifter whose last weeks ran other rep ranges (5-8 heavy, 15-20 light), the newest three
 * days ago: today's 10-15 is a new range for the lift, with no break.
 */
function otherRanges(): WorkoutRecord[] {
  const k = 14;
  const max = 300;
  return [16, 8, 16, 8, 16, 8].map((total, index) => {
    const weight = Math.round((max / (1 + total / k)) * 2) / 2;
    const range: [number, number] = total === 8 ? [5, 8] : [15, 20];
    return session(3 + 7 * (5 - index), weight, Math.max(1, total - 1), total, index, range);
  });
}

function target(history: WorkoutRecord[]) {
  return recommendNextTarget({
    exercise: curl,
    role: 'isolation',
    prescription: prescribe(curl, 'isolation', profile),
    history,
    profile,
    now: RECORD_NOW,
    maxes: null,
  });
}

describe("a lift's own curve in its targets", () => {
  it('is active on the low curve, and speaks for the reps its checks spanned', () => {
    const curve = liftCurve(lowCurve(25), curl.id, RECORD_NOW);
    expect(curve.active).toBe(true);
    expect(curve.k).toBeLessThan(24);
    expect(curve.span).toEqual([7, 17]);
  });

  it('sets a return after a break from the last best set, and says so', () => {
    const history = lowCurve(25);
    const back = target(history);
    expect(back.mode).toBe('return');
    const curve = liftCurve(history, curl.id, RECORD_NOW);
    const prescription = prescribe(curl, 'isolation', profile);
    // The last session's best set: the most weight times reps (its ordinary set).
    const last = history.at(-1)!.entries[0]!.sets;
    const best = [...last].sort((a, b) => (b.weight ?? 0) * b.reps - (a.weight ?? 0) * a.reps)[0]!;
    // The rule's load, moved by the curve's shape from the set's reps to failure (its reps and
    // the reserve logged) to the target's.
    const toReps = prescription.reps[1] + prescription.rir;
    const rule = ruleLoad(best.weight!, best.reps, toReps, 30);
    const own = curveLoad(curve, rule, best, toReps)!;
    expect(Math.abs(own - rule)).toBeGreaterThan(1);
    // The target is the curve's, rounded to the stack, and so not the rule's.
    expect(back.weight).toBe(Math.round((own * 0.9) / 10) * 10);
    expect(back.weight).not.toBe(Math.round((rule * 0.9) / 10) * 10);
    expect(
      back.evidence.some((line) =>
        line.startsWith(
          'Your own reps-to-weight curve on Cable Curl, from 6 sets to failure, sets this weight',
        ),
      ),
    ).toBe(true);
  });

  it('sets the first target of a new rep range from the last best set, and says so', () => {
    const history = otherRanges();
    const zone = target(history);
    expect(zone.mode).toBe('estimate');
    expect(zone.otherRange).toBe(true);
    const curve = liftCurve(history, curl.id, RECORD_NOW);
    expect(curve.active).toBe(true);
    const prescription = prescribe(curl, 'isolation', profile);
    const last = history.at(-1)!.entries[0]!.sets;
    const best = [...last].sort((a, b) => (b.weight ?? 0) * b.reps - (a.weight ?? 0) * a.reps)[0]!;
    const toReps = prescription.reps[1] + prescription.rir;
    const own = curveLoad(curve, ruleLoad(best.weight!, best.reps, toReps, 30), best, toReps)!;
    expect(zone.weight).toBe(Math.round((own * 0.95) / 10) * 10);
    expect(
      zone.evidence.some((line) => line.startsWith('Your own reps-to-weight curve on Cable Curl')),
    ).toBe(true);
  });

  it('leaves a return to the rule without an active curve', () => {
    // One range only: no pairs, no curve.
    const oneRange = lowCurve(25).map((record) => ({
      ...record,
      entries: record.entries.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set) =>
          set.reserveCheck ? { ...set, reserveCheck: { total: 12 } } : set,
        ),
      })),
    }));
    expect(liftCurve(oneRange, curl.id, RECORD_NOW).active).toBe(false);
    const back = target(oneRange);
    expect(back.evidence.some((line) => line.includes('Your own reps-to-weight curve'))).toBe(
      false,
    );
  });

  it('forgets the curve after the lifter resets it (item 47)', () => {
    const history = lowCurve(25);
    const back = recommendNextTarget({
      exercise: curl,
      role: 'isolation',
      prescription: prescribe(curl, 'isolation', profile),
      history,
      profile,
      now: RECORD_NOW,
      maxes: null,
      resets: { curves: RECORD_NOW },
    });
    expect(back.evidence.some((line) => line.includes('Your own reps-to-weight curve'))).toBe(
      false,
    );
  });

  it('quotes the reserve as logged, with what the rules read it as (the review of item 43)', () => {
    const logged = [
      record(
        3,
        curl.id,
        [
          [12, 40, 1],
          [12, 40, 1],
          [12, 40, 1],
        ],
        [10, 15],
        1,
      ),
    ];
    const next = target(
      withReadReserve(logged, { correction: 2, band: [12, 17] }) as WorkoutRecord[],
    );
    expect(next.evidence[0]).toMatch(
      /^Last: 40 lb × 12, 12, 12 @ RIR 1, read as 3 from your reserve checks \(/,
    );
    expect(target(logged).evidence[0]).toMatch(/^Last: 40 lb × 12, 12, 12 @ RIR 1 \(/);
  });

  it('stops speaking twelve weeks after its newest reading', () => {
    const old = lowCurve(PERSONAL_CURVE.WINDOW_DAYS + 1);
    expect(liftCurve(old, curl.id, RECORD_NOW).active).toBe(false);
  });
});
