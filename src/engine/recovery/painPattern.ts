import { getExercise } from '../../catalog/exercises/catalog';
import { JOINTS, type CatalogExercise, type Joint } from '../../catalog/exercises/exerciseSchema';
import { localDaysBetween } from '../../core/time/localDate';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { LastingSwap } from '../planning/lastingSwaps';
import { swapIsPast } from '../planning/lastingSwaps';
import { RETURN_AFTER_DAYS } from '../progression/progression';

/**
 * Pain patterns over weeks (Maintenance 27, the owner's item 45, docs/research/pain-patterns.md):
 * a joint that keeps hurting with one exercise and not with its alternative. Observational and
 * conservative: what the lifter logged, counted, never a diagnosis. Every number is a judgement
 * anchored to the evidence there:
 *
 * - A single report is noise (39% of athletes report a problem in an average week, Clarsen et al.
 *   2013); a pattern needs two reports at least a week apart, more than one bout of soreness can
 *   explain (it lasts one to five days and peaks at 48 to 72 hours, Armstrong 1984; Hotfiel et al.
 *   2018), in at least half the sessions with the exercise, the latest one included.
 * - Its alternative must have two clean sessions, not one, which chance alone could give.
 * - Six weeks: the activity changes in pain-monitored programmes ran four to six weeks (Silbernagel
 *   et al. 2007), and the engine's long break starts at 42 days.
 * - A report made before the session (a check-in) can be soreness from the session before: it is
 *   never put on an exercise.
 */
export const PAIN_PATTERN = {
  WINDOW_DAYS: 42,
  MIN_REPORTS: 2,
  MIN_SPAN_DAYS: 7,
  MIN_SHARE: 0.5,
  CLEAN_SESSIONS: 2,
} as const;

const DAY_MS = 86_400_000;
const STRESS_RANK = { low: 0, moderate: 1, high: 2 } as const;

/** The day a workout counts on: the one it began (one saved after midnight is its start's). */
const whenOf = (record: WorkoutRecord) => record.startedAt;
const isJoint = (value: unknown): value is Joint =>
  typeof value === 'string' && (JOINTS as readonly string[]).includes(value);

/** The stress an exercise puts on a joint, 0 for none or low, 1 moderate, 2 high. */
export function stressOn(exercise: CatalogExercise, joint: Joint): number {
  const level = exercise.jointStress[joint];
  return level ? STRESS_RANK[level] : 0;
}

/** Exercises with a completed working set in a workout. */
function doneIn(record: WorkoutRecord): Set<string> {
  return new Set(
    record.entries
      .filter((entry) => entry.sets.some((set) => set.kind === 'working' && set.completed))
      .map((entry) => entry.exerciseId),
  );
}

/** Every joint reported in a workout, by any route: before, during or after it. */
function jointsReported(record: WorkoutRecord): Set<Joint> {
  const joints = new Set<Joint>();
  if (record.rating?.pain && isJoint(record.rating.joint)) joints.add(record.rating.joint);
  for (const joint of record.painJoints ?? []) if (isJoint(joint)) joints.add(joint);
  for (const report of record.painReports ?? [])
    if (isJoint(report.joint)) joints.add(report.joint);
  for (const joint of record.readiness?.jointDiscomfort ?? [])
    if (isJoint(joint)) joints.add(joint);
  return joints;
}

/**
 * The exercises a workout's pain reports belong to, by joint. A report made on an exercise during
 * the workout is that exercise's. One saved without its exercise (the end-of-workout rating's
 * joint, or a report from a copy before item 45) is put on an exercise only when it was the one
 * done that session loading the joint at moderate or high stress; with two or more, on none. A
 * check-in's joint is never put on one.
 */
export function attributedPain(record: WorkoutRecord): Map<Joint, Set<string>> {
  const done = doneIn(record);
  const out = new Map<Joint, Set<string>>();
  const add = (joint: Joint, exerciseId: string) =>
    out.set(joint, new Set([...(out.get(joint) ?? []), exerciseId]));
  const direct = new Set<Joint>();
  for (const report of record.painReports ?? []) {
    if (!isJoint(report.joint)) continue;
    add(report.joint, report.exerciseId);
    direct.add(report.joint);
  }
  // The workout keeps a check-in's joints among its pain joints: those are never put on an
  // exercise, whichever route they came by (the review of item 45). A record from before item 45
  // saved no reports, so its pain joints are its reports, less its last check-in's; from item 45
  // on every record saves its reports, so a pain joint beyond them is a check-in's, any check-in
  // that day (the re-check: an updated check-in left the earlier one's joint behind).
  const legacy = record.painReports === undefined;
  const checkIn = new Set<string>(record.readiness?.jointDiscomfort ?? []);
  if (!legacy) {
    for (const joint of record.painJoints ?? [])
      if (!direct.has(joint as Joint)) checkIn.add(joint);
  }
  const unplaced = new Set<Joint>();
  if (record.rating?.pain && isJoint(record.rating.joint)) unplaced.add(record.rating.joint);
  if (legacy) {
    for (const joint of record.painJoints ?? [])
      if (isJoint(joint) && !direct.has(joint)) unplaced.add(joint);
  }
  for (const joint of checkIn) unplaced.delete(joint as Joint);
  for (const joint of unplaced) {
    const loading = [...done].filter((id) => {
      const exercise = getExercise(id);
      return exercise !== undefined && stressOn(exercise, joint) >= 1;
    });
    if (loading.length === 1) add(joint, loading[0] as string);
  }
  return out;
}

/** A pattern: a joint that keeps hurting with one exercise, not with its alternative. */
export interface PainPattern {
  exerciseId: string;
  joint: Joint;
  /** Sessions with the exercise in the window, and the dates of those with a report. */
  sessions: number;
  reportDates: string[];
  /** The alternative, and the dates of its sessions without a report at the joint. */
  alternativeId: string;
  cleanDates: string[];
}

/**
 * The patterns in the last six weeks, the one with the most reports first. An exercise with a
 * lasting swap running is left alone; `fits` says whether an alternative can be done today, and
 * `since` is when the lifter last reset what the app learned of pain (item 47).
 */
export function painPatterns(input: {
  history: readonly WorkoutRecord[];
  now: string;
  swaps?: readonly LastingSwap[];
  fits?: (exercise: CatalogExercise) => boolean;
  since?: string | null;
}): PainPattern[] {
  const now = Date.parse(input.now);
  const from = Math.max(
    now - PAIN_PATTERN.WINDOW_DAYS * DAY_MS,
    input.since ? Date.parse(input.since) : -Infinity,
  );
  const window = input.history
    .filter((record) => {
      const at = Date.parse(whenOf(record));
      return at >= from && at <= now;
    })
    .sort((a, b) => whenOf(a).localeCompare(whenOf(b)));
  const facts = window.map((record) => ({
    record,
    at: whenOf(record),
    done: doneIn(record),
    pain: attributedPain(record),
    reported: jointsReported(record),
  }));
  const swapped = new Set(
    (input.swaps ?? []).filter((swap) => !swapIsPast(swap, input.now)).map((swap) => swap.from),
  );
  const exercises = new Set(facts.flatMap((fact) => [...fact.done]));
  for (const fact of facts)
    for (const ids of fact.pain.values()) for (const id of ids) exercises.add(id);

  const patterns: PainPattern[] = [];
  for (const exerciseId of exercises) {
    const exercise = getExercise(exerciseId);
    if (!exercise || swapped.has(exerciseId)) continue;
    for (const joint of JOINTS) {
      if (stressOn(exercise, joint) < 1) continue;
      // Sessions with the exercise: done, or reported painful on it before a set was done.
      const all = facts.filter(
        (fact) => fact.done.has(exerciseId) || (fact.pain.get(joint)?.has(exerciseId) ?? false),
      );
      // A lift away three weeks or more (a four-week swap among them) comes back fresh: only what
      // is logged since its return counts, and one returning today has nothing yet (the review).
      // The engine's own break rule, in elapsed time as it reads it (the re-check).
      const apart = (from: string, to: string) =>
        Date.parse(to) - Date.parse(from) >= RETURN_AFTER_DAYS * DAY_MS;
      const latest = all.at(-1);
      if (!latest || apart(latest.at, input.now)) continue;
      let start = 0;
      all.forEach((fact, index) => {
        const previous = all[index - 1];
        if (previous && apart(previous.at, fact.at)) start = index;
      });
      const sessions = all.slice(start);
      const reported = sessions.filter((fact) => fact.pain.get(joint)?.has(exerciseId) ?? false);
      if (reported.length < PAIN_PATTERN.MIN_REPORTS) continue;
      // A week apart on the calendar, not to the minute (the review of item 45).
      const first = (reported[0] as (typeof facts)[number]).at;
      const last = (reported.at(-1) as (typeof facts)[number]).at;
      if (localDaysBetween(first, last) < PAIN_PATTERN.MIN_SPAN_DAYS) continue;
      if (reported.length < PAIN_PATTERN.MIN_SHARE * sessions.length) continue;
      if (sessions.at(-1) !== reported.at(-1)) continue;
      const alternative = alternativeFor(exercise, joint, facts, input.fits);
      if (!alternative) continue;
      patterns.push({
        exerciseId,
        joint,
        sessions: sessions.length,
        reportDates: reported.map((fact) => fact.at),
        alternativeId: alternative.id,
        cleanDates: alternative.clean,
      });
    }
  }
  return patterns.sort(
    (a, b) =>
      b.reportDates.length - a.reportDates.length ||
      (b.reportDates.at(-1) ?? '').localeCompare(a.reportDates.at(-1) ?? '') ||
      a.exerciseId.localeCompare(b.exerciseId),
  );
}

/**
 * The exercise's alternative for the pattern: one done in its place (swapped in for it), or a
 * listed substitution of the same movement, with two or more sessions without the exercise and
 * without a report at the joint, none with one, no more stress on the joint, and fitting today.
 */
function alternativeFor(
  exercise: CatalogExercise,
  joint: Joint,
  facts: readonly {
    record: WorkoutRecord;
    at: string;
    done: Set<string>;
    reported: Set<Joint>;
  }[],
  fits: ((exercise: CatalogExercise) => boolean) | undefined,
): { id: string; clean: string[] } | null {
  const candidates = new Set<string>();
  for (const fact of facts) {
    for (const entry of fact.record.entries) {
      if (entry.replacedFrom === exercise.id) candidates.add(entry.exerciseId);
    }
  }
  for (const id of exercise.substitutions) {
    if (getExercise(id)?.movementPattern === exercise.movementPattern) candidates.add(id);
  }
  candidates.delete(exercise.id);
  let best: { id: string; clean: string[]; stress: number } | null = null;
  for (const id of candidates) {
    const other = getExercise(id);
    if (!other || stressOn(other, joint) > stressOn(exercise, joint)) continue;
    if (fits && !fits(other)) continue;
    // Its sessions: done, or reported painful on it before a set was done (the review of item 45).
    const reportedOn = (fact: (typeof facts)[number]) =>
      (fact.record.painReports ?? []).some(
        (report) => report.exerciseId === id && report.joint === joint,
      );
    const withIt = facts.filter((fact) => fact.done.has(id) || reportedOn(fact));
    if (withIt.some((fact) => fact.reported.has(joint))) continue;
    const clean = withIt.filter((fact) => !fact.done.has(exercise.id)).map((fact) => fact.at);
    if (clean.length < PAIN_PATTERN.CLEAN_SESSIONS) continue;
    const stress = stressOn(other, joint);
    if (
      !best ||
      clean.length > best.clean.length ||
      (clean.length === best.clean.length && stress < best.stress)
    ) {
      best = { id, clean, stress };
    }
  }
  return best ? { id: best.id, clean: best.clean } : null;
}
