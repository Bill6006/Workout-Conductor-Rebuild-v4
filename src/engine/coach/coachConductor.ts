import { getExercise, requireExercise } from '../../catalog/exercises/catalog';
import { isHold, type CatalogExercise, type Joint } from '../../catalog/exercises/exerciseSchema';
import { muscleName, muscleVerb, type MuscleId } from '../../catalog/muscles/muscles';
import { UNFINISHED_STALE_HOURS } from '../../core/alerts/cues';
import type { LocationProfile } from '../../core/validation/location';
import type { ProgramStyle, UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { remainingMinutes } from '../duration/duration';
import { fitWeight, loadingFor, type SessionLoading } from '../loading/loading';
import { weightStep } from '../plateMath/plateMath';
import type {
  CompletedWork,
  RecalibrationTrigger,
  SessionConstraints,
} from '../recalibration/types';
import type { LastingSwap } from '../planning/lastingSwaps';
import type { PlannedSession } from '../planning/weeklyPlan';
import type { FatigueSignal } from '../recovery/fatigue';
import { lastPainReport, painSourceLine } from '../recovery/painReport';
import { stepsOfSessionLine } from '../recovery/sessionContext';
import { stepsOfHabitLine } from '../progression/overrides';
import {
  ROUTE_STEPS,
  describeRoute,
  detectStalls,
  emptyRoutes,
  type CoachRoute,
  type CoachRoutes,
  type StallDiagnosis,
} from '../strategy/plateau';
import type { StrategyInsight } from '../strategy/strategy';
import { coachingPolicy, type CoachingPolicy } from './experience';
import { adviseStyle, allowsFailure, resolveStyle, undulatingCase } from '../planning/styleAdvice';
import { leadEvidence, styleInfo } from '../planning/styles';
import {
  computeExposure,
  computeMusclePriorities,
  computeWeeklyVolume,
} from '../volume/weeklyVolume';
import { checkExerciseFit } from '../conflicts/conflictEngine';
import { barWeightFor, startRatio } from '../progression/startingLoad';
import {
  EFFORT_REPS_CEILING,
  WELL_SHORT,
  entryPushedToEffort,
  microDeload,
  stepUp,
} from '../progression/progression';
import { MAX_WORKING_SETS } from '../recalibration/recalibrate';
import {
  accessoryPicker,
  pickAccessoryFor,
  sessionConflictContext,
  swappedOutIds,
} from '../workoutGenerator/generate';
import {
  allEntries,
  isStopped,
  workingSets,
  type DurationChoice,
  type EntryProgression,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../workout/types';

/**
 * The Coach Conductor: one adaptive coach surface fed by every smart system.
 * Each system contributes signals; conflicts resolve by fixed priority
 * (safety/form > save/storage > recovery/fatigue > plateau > progression >
 * exercise fit > weekly coverage > rest > tips). The winner becomes the one
 * gold card with at most one action and concise Why evidence. Nothing is ever
 * applied automatically; every action is a tap the user makes.
 */

export type CoachDomain =
  'safety' | 'save' | 'recovery' | 'plateau' | 'progression' | 'fit' | 'coverage' | 'rest' | 'tips';

export const DOMAIN_PRIORITY: readonly CoachDomain[] = [
  'safety',
  'save',
  'recovery',
  'plateau',
  'progression',
  'fit',
  'coverage',
  'rest',
  'tips',
];

/** Ties an action to the coach route step it carries out, so the store can record it. */
export interface RouteRef {
  exerciseId: string;
  step: number;
  baselineE1rm: number;
}

type CoachActionBase =
  | { kind: 'recalibrate'; trigger: RecalibrationTrigger; label: string; major?: boolean }
  | { kind: 'rest'; deltaSeconds: number; label: string }
  | { kind: 'readiness'; label: string }
  | { kind: 'alternatives'; entryId: string; label: string }
  | { kind: 'backup'; label: string }
  /** The next session leads with this muscle (a coach focus). */
  | { kind: 'focus'; muscle: MuscleId; label: string }
  /** Opens the end-of-workout sheet, where the day is saved as it stands. */
  | { kind: 'finish'; label: string }
  /** Sets the programming style; the plan is rebuilt under it. */
  | { kind: 'style'; style: ProgramStyle; label: string };

export type CoachAction = CoachActionBase & { route?: RouteRef };

export interface CoachSignal {
  domain: CoachDomain;
  headline: string;
  why: string[];
  action: CoachAction | null;
  confidence: 'low' | 'medium' | 'high';
  severity: number;
  source: string;
  /** Restates a target the lifter can read from the card; hidden past beginner level. */
  obvious?: boolean;
  /** The lift the signal is about, when it is about one; declines are remembered per lift. */
  exerciseId?: string;
  /**
   * What a safety card is about (a joint, or last session's pain). Not now sets that aside
   * for the rest of the workout; the same worry about another exercise stays quiet with it,
   * and a new one still shows.
   */
  concern?: string;
}

/** Declined offers, kept in the meta store: key `source|exerciseId` (or `*`). */
export interface CoachDeclines {
  id: 'coach-declines';
  declines: Record<string, { count: number; lastAt: string }>;
}

export const COACH_DECLINES_ID = 'coach-declines';
/** A declined offer stays away this long; twice declined, it stays away until the count is cleared. */
export const DECLINE_SUPPRESS_DAYS = 7;

export function emptyDeclines(): CoachDeclines {
  return { id: COACH_DECLINES_ID, declines: {} };
}

export function declineKey(signal: Pick<CoachSignal, 'source' | 'exerciseId'>): string {
  return `${signal.source}|${signal.exerciseId ?? '*'}`;
}

export function recordDecline(
  declines: CoachDeclines,
  signal: Pick<CoachSignal, 'source' | 'exerciseId'>,
  now: string,
): CoachDeclines {
  const key = declineKey(signal);
  const current = declines.declines[key];
  return {
    ...declines,
    declines: { ...declines.declines, [key]: { count: (current?.count ?? 0) + 1, lastAt: now } },
  };
}

/**
 * A safety card's Not now lasts for this workout only: safety is never declined for days, but
 * a warning the lifter has read and set aside must not sit on the screen for the rest of it.
 * A card with nothing to tap is a note, not an offer, and is set aside the same way
 * (Maintenance 21): it is never remembered for days, so a must-know comes back next workout.
 */
export function setAsideKey(
  signal: Pick<CoachSignal, 'source' | 'concern'> & Partial<Pick<CoachSignal, 'exerciseId'>>,
): string {
  return `set aside|${signal.source}|${signal.concern ?? signal.exerciseId ?? '*'}`;
}

/** Whether Not now puts this card away for the workout rather than declining it for days. */
export function setAsideForWorkout(
  signal: Partial<Pick<CoachSignal, 'domain' | 'action'>>,
): boolean {
  return signal.domain === 'safety' || signal.action === null;
}

export function isSetAside(accepted: readonly string[] | undefined, signal: CoachSignal): boolean {
  return (
    setAsideForWorkout(signal) && accepted !== undefined && accepted.includes(setAsideKey(signal))
  );
}

/** What identifies an offer once it has been taken: where it came from, and what it said. */
export function acceptKey(signal: Pick<CoachSignal, 'source' | 'exerciseId' | 'headline'>): string {
  return `${declineKey(signal)}|${signal.headline}`;
}

/**
 * An offer the lifter already took this session. The evidence behind many
 * offers is the last weeks of history, which a tap does not change, so without
 * this the same button comes straight back and a second tap stacks the change.
 */
export function isAccepted(accepted: readonly string[] | undefined, signal: CoachSignal): boolean {
  return accepted !== undefined && accepted.includes(acceptKey(signal));
}

/** A signal the lifter already took or put away: it will not show, so it holds no place. */
function putAway(input: CoachInput, signal: CoachSignal): boolean {
  return (
    isDeclined(input.declines, signal, input.now) ||
    isAccepted(input.accepted, signal) ||
    isSetAside(input.accepted, signal)
  );
}

export function isDeclined(
  declines: CoachDeclines | undefined,
  signal: CoachSignal,
  now: string,
): boolean {
  if (!declines || signal.domain === 'safety') return false;
  const entry = declines.declines[declineKey(signal)];
  if (!entry) return false;
  if (entry.count >= 2) return true;
  return Date.parse(now) - Date.parse(entry.lastAt) < DECLINE_SUPPRESS_DAYS * DAY_MS;
}

export interface CoachCard {
  signal: CoachSignal;
  considered: number;
  domains: CoachDomain[];
  policy: CoachingPolicy;
}

export interface CoachInput {
  workout: GeneratedWorkout;
  status: 'preview' | 'active' | 'paused' | 'completed';
  duration: DurationChoice;
  completed: CompletedWork;
  constraints: SessionConstraints;
  profile: UserProfile;
  history: readonly WorkoutRecord[];
  now: string;
  fatigue: FatigueSignal;
  strategy: readonly StrategyInsight[];
  lastExportAt: string | null;
  /** The cloud copy is on and holds everything logged, so a backup reminder would be noise. */
  cloudCurrent?: boolean;
  /** Offers already taken this session (see `acceptKey`): they are not made twice. */
  accepted?: readonly string[];
  /** The workout clock, so the room left today is what the clock has not already used. */
  elapsedSeconds?: number;
  workoutCount: number;
  /** Defaults derive from the profile and history; tests and the store pass them in. */
  policy?: CoachingPolicy;
  stalls?: StallDiagnosis[];
  routes?: CoachRoutes;
  declines?: CoachDeclines;
  /** The place today trains at, so the coverage action can pick an exercise that fits. */
  location?: LocationProfile;
  /** Plates missing today, so a load offer names only a weight the place makes (Maintenance 24). */
  loading?: SessionLoading;
  /** The sessions the generator would produce this week; coverage stays quiet when one reaches the muscle. */
  upcoming?: readonly PlannedSession[];
  /** The current coach focus, so it is never offered twice. */
  focus?: MuscleId | null;
  /** The lifter's lasting swaps: an exercise swapped out is never offered. */
  swaps?: readonly LastingSwap[];
}

const DAY_MS = 86_400_000;

function doneKeys(completed: CompletedWork): Set<string> {
  return new Set(completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
}

/** Entries with work still to do. A stopped one has none: its sets went to its stand-in. */
function remainingEntries(input: CoachInput): WorkoutEntry[] {
  const keys = doneKeys(input.completed);
  return allEntries(input.workout.blocks).filter(
    (entry) =>
      !isStopped(entry) &&
      entry.sets.some((set) => set.kind === 'working' && !keys.has(`${entry.id}:${set.index}`)),
  );
}

/** Today's entry for a lift an offer is about; a stopped one takes no change (Maintenance 22). */
function liveEntryFor(input: CoachInput, exerciseId: string): WorkoutEntry | undefined {
  return allEntries(input.workout.blocks).find(
    (candidate) => candidate.exerciseId === exerciseId && !isStopped(candidate),
  );
}

function started(input: CoachInput, entry: WorkoutEntry): boolean {
  return input.completed.sets.some((set) => set.entryId === entry.id && !set.skipped);
}

/** A deload week covers today (Maintenance 24): see pushesForMore. */
function inDeloadWeek(input: CoachInput): boolean {
  return input.constraints.deload !== null;
}

/**
 * A deload week is the week's change (Maintenance 24): its lighter loads and extra rep in reserve
 * answer a lift that stalled and a muscle behind its week. Meanwhile the coach says nothing that
 * pushes for more: no plateau or weekly-coverage card, nothing at the heaviest weight here, and no
 * offer of an extra set, a new rep range or a drop set. A longer rest still speaks.
 */
function pushesForMore(signal: CoachSignal): boolean {
  const trigger = signal.action?.kind === 'recalibrate' ? signal.action.trigger : null;
  // A longer rest pushes for nothing.
  if (trigger?.type === 'rest-adjust') return false;
  if (signal.domain === 'plateau' || signal.domain === 'coverage' || signal.source === 'capped') {
    return true;
  }
  return (
    (trigger?.type === 'sets' && trigger.workingDelta > 0) ||
    trigger?.type === 'rep-range' ||
    (trigger?.type === 'drop-set' && trigger.on)
  );
}

/**
 * A load step at the place (Maintenance 24): the weight it lands on, the step it was fitted from
 * and the weight that step goes from, and whether today's target has it already: the plan took it
 * itself (its own step, one for the session, a deload, a return after a break).
 */
interface PlaceStep {
  weight: number;
  step: number;
  base: number;
  taken: boolean;
}

/** Modes whose target is lighter by the plan's own rule. */
const LIGHTER_MODES: ReadonlySet<EntryProgression['mode']> = new Set([
  'return',
  'estimate',
  'deload',
  'regress',
]);

/**
 * The steps the session or the lifter's habit moved a target (Maintenance 24). A plan saved before
 * targets recorded them, one kept from the day this update lands, is read by its own lines.
 */
function nudgedOf(progression: EntryProgression): number {
  return (
    progression.nudged ??
    progression.evidence.reduce(
      (total, line) => total + stepsOfSessionLine(line) + stepsOfHabitLine(line),
      0,
    )
  );
}

/**
 * A lighter day (Maintenance 24): one the plan chose itself (back after a break, a new rep range,
 * a deload or a reset, or a step down for the work before the lift today or the lifter's own
 * habit), or a weight set by hand under the one last lifted, the coach's own deload among them. No
 * step up is offered on it, and its own lighter load stands for a micro-deload.
 */
function lighterDay(entry: WorkoutEntry, loads: { from: number; asked: number }): boolean {
  const progression = entry.progression;
  if (!progression) return false;
  return (
    LIGHTER_MODES.has(progression.mode) ||
    nudgedOf(progression) < 0 ||
    (entry.manual?.weight === true && loads.asked < loads.from - 1e-6)
  );
}

/**
 * A lift's loads today (Maintenance 24): the weight last lifted, today's target as the plan asks
 * it, and the weight its sets show. A set the weights here push shows less than the plan asks.
 */
function loadsOf(entry: WorkoutEntry): { from: number; asked: number; shown: number } | null {
  const first = workingSets(entry).find((set) => set.kind === 'working');
  const shown = first?.targetWeight ?? null;
  if (shown === null) return null;
  const asked = first?.asked?.weight ?? shown;
  return { from: entry.progression?.from ?? asked, asked, shown };
}

/**
 * The next load step for a lift: one ordinary step up from the weight last lifted, onto a weight
 * the place makes today, missing plates counted (Maintenance 24). Taken when today's target has a
 * step up already. None on a lighter day the plan chose (back after a break, a new rep range, a
 * step down for the session), for a set the weights here push already, or where the step lands
 * back on today's target (the heaviest weight here, a gap in the dumbbells, a plate missing): the
 * plan then holds the load and raises the reps.
 */
function heavierHere(
  input: CoachInput,
  exercise: CatalogExercise,
  entry: WorkoutEntry,
): PlaceStep | null {
  const loads = loadsOf(entry);
  if (!loads) return null;
  const { from, asked, shown } = loads;
  const units = input.profile.units;
  const increment = weightStep(exercise, units);
  const step = from + increment;
  // The plan took its step: its own, or one for the session.
  if (asked >= Math.min(stepUp(from, increment), step) - 1e-6) {
    return { weight: asked, step, base: from, taken: true };
  }
  if (lighterDay(entry, loads) || asked > shown + 1e-6) return null;
  const loading = loadingFor(input.location?.loading, input.loading, exercise, units);
  const weight = fitWeight(step, loading, barWeightFor(exercise, units));
  return weight > asked + 1e-6 ? { weight, step, base: from, taken: false } : null;
}

/**
 * The plan's micro-deload for a lift, onto a weight the place makes today (Maintenance 24): a
 * tenth off and at least one step, from today's target or the weight last lifted, whichever is
 * heavier, or from the weight a set the weights here push shows. Taken when today's target is that
 * far down already (the plan's deload, a reset, a return after a break). None when nothing
 * lighter is made here.
 */
function lighterHere(
  input: CoachInput,
  exercise: CatalogExercise,
  entry: WorkoutEntry,
): PlaceStep | null {
  const loads = loadsOf(entry);
  if (!loads) return null;
  const { from, asked, shown } = loads;
  const units = input.profile.units;
  const increment = weightStep(exercise, units);
  const base = asked > shown + 1e-6 ? shown : Math.max(from, asked);
  const step = microDeload(base, increment);
  if (lighterDay(entry, loads) || asked <= microDeload(from, increment) + 1e-6) {
    return { weight: shown, step, base, taken: true };
  }
  const loading = loadingFor(input.location?.loading, input.loading, exercise, units);
  const weight = fitWeight(step, loading, barWeightFor(exercise, units));
  return weight < base - 1e-6 ? { weight, step, base, taken: false } : null;
}

function jointLabel(joint: Joint): string {
  return joint.replace('-', ' ');
}

/** Joints an offer must spare today: those reported this session, and the one named last time. */
function jointsToProtect(input: CoachInput): Joint[] {
  const report = lastPainReport(input.history);
  const joints = [...input.constraints.painJoints];
  if (report && !joints.includes(report.joint)) joints.push(report.joint);
  return joints;
}

function safetySignals(input: CoachInput): CoachSignal[] {
  // A finished workout has nothing left to swap: its warnings were for the sets still to come.
  if (input.status === 'completed') return [];
  const signals: CoachSignal[] = [];
  const remaining = remainingEntries(input);
  for (const joint of input.constraints.painJoints) {
    const loaded = remaining.find((entry) => {
      const stress = requireExercise(entry.exerciseId).jointStress[joint];
      return stress === 'moderate' || stress === 'high';
    });
    if (loaded) {
      const name = requireExercise(loaded.exerciseId).name;
      signals.push({
        domain: 'safety',
        headline: `Protect your ${jointLabel(joint)}: ${name} loads it`,
        why: [
          `You reported ${jointLabel(joint)} pain this session.`,
          `${name} puts ${requireExercise(loaded.exerciseId).jointStress[joint]} stress on it.`,
        ],
        action: { kind: 'alternatives', entryId: loaded.id, label: `Swap ${name}` },
        confidence: 'high',
        severity: 3,
        source: 'session pain',
        concern: joint,
      });
    }
  }
  // Pain reported where it hurt when the last workout was saved: only exercises that load that
  // joint are named, and never the workout that report came from.
  const report = lastPainReport(input.history);
  // Pain marked on the same joint today already has its own card, and its Not now covers both.
  if (report && !input.constraints.painJoints.includes(report.joint)) {
    const loading = remaining.filter((entry) => {
      const stress = requireExercise(entry.exerciseId).jointStress[report.joint];
      return (stress === 'moderate' || stress === 'high') && !started(input, entry);
    });
    const [first, ...others] = loading;
    if (first) {
      const exercise = requireExercise(first.exerciseId);
      const joint = jointLabel(report.joint);
      signals.push({
        domain: 'safety',
        headline: `${joint.charAt(0).toUpperCase()}${joint.slice(1)} pain last time: ${exercise.name} loads it`,
        why: [
          `${painSourceLine(report)}.`,
          `${exercise.name} puts ${exercise.jointStress[report.joint]} stress on it${
            others.length === 0
              ? ''
              : `, and ${others.length === 1 ? 'one more exercise' : `${others.length} more exercises`} today ${others.length === 1 ? 'does' : 'do'} too`
          }.`,
        ],
        action: { kind: 'alternatives', entryId: first.id, label: `Swap ${exercise.name}` },
        confidence: 'high',
        severity: 2,
        source: RATING_PAIN_SOURCE,
        concern: `${report.recordId}|${report.joint}`,
      });
    }
  }
  for (const joint of input.profile.limitations.painAreas) {
    const watch = remaining.find(
      (entry) => requireExercise(entry.exerciseId).jointStress[joint] === 'moderate',
    );
    if (watch) {
      const name = requireExercise(watch.exerciseId).name;
      signals.push({
        domain: 'safety',
        headline: `Watch your ${jointLabel(joint)} on ${name}`,
        why: [
          `${jointLabel(joint)} is a flagged pain area in your profile.`,
          `${name} carries moderate stress there; swap it now, or stop the set if it bites.`,
        ],
        action: { kind: 'alternatives', entryId: watch.id, label: `Swap ${name}` },
        confidence: 'medium',
        severity: 1,
        source: 'profile limitations',
        concern: joint,
      });
      break;
    }
  }
  return signals;
}

/**
 * A workout started hours ago and never finished stays open until it is ended,
 * so its sets are not in the history and tomorrow's plan does not know them.
 * The card says how long it has been open and offers the way to save it.
 */
/** The source of the card that names a workout left open; Not now on it lasts for that workout only. */
export const UNFINISHED_SOURCE = 'unfinished workout';

/** The card for pain reported, and where, when the last workout was saved. */
export const RATING_PAIN_SOURCE = 'rating pain';

function unfinishedSignals(input: CoachInput): CoachSignal[] {
  if (input.status !== 'active' && input.status !== 'paused') return [];
  // Not now on this card is about this workout, not the next one left open.
  if (input.accepted?.includes(UNFINISHED_SOURCE)) return [];
  const stamps = [
    input.completed.startedAt,
    ...input.completed.sets.map((set) => set.completedAt),
  ].filter((stamp): stamp is string => typeof stamp === 'string');
  if (stamps.length === 0) return [];
  const last = stamps.reduce((latest, stamp) => (stamp > latest ? stamp : latest));
  const hours = (Date.parse(input.now) - Date.parse(last)) / 3_600_000;
  if (!(hours >= UNFINISHED_STALE_HOURS)) return [];
  const entries = allEntries(input.workout.blocks);
  const touched = new Set(
    input.completed.sets.filter((set) => !set.skipped).map((set) => set.entryId),
  );
  const logged = entries.filter((entry) => touched.has(entry.id)).length;
  const open =
    hours >= 48
      ? `${Math.floor(hours / 24)} days`
      : hours >= 24
        ? 'a day'
        : `${Math.floor(hours)} hours`;
  return [
    {
      domain: 'save',
      headline: `This workout has been open for ${open}`,
      why: [
        `${logged} of ${entries.length} exercises have logged sets, and nothing is lost.`,
        'End it to save the day as it stands, or carry on where you left off.',
      ],
      action: { kind: 'finish', label: 'End and save it' },
      confidence: 'high',
      severity: 3,
      source: UNFINISHED_SOURCE,
    },
  ];
}

function saveSignals(input: CoachInput): CoachSignal[] {
  if (input.workoutCount < 3) return [];
  // Everything logged is already in the cloud copy: nothing to remind about.
  if (input.cloudCurrent) return [];
  const age = input.lastExportAt
    ? (Date.parse(input.now) - Date.parse(input.lastExportAt)) / DAY_MS
    : null;
  if (age !== null && age < 14) return [];
  return [
    {
      domain: 'save',
      headline: 'Back up your history',
      why: [
        `${input.workoutCount} workouts are stored only on this device.`,
        age === null
          ? 'No backup has been exported yet.'
          : `The last backup is ${Math.floor(age)} days old.`,
      ],
      action: { kind: 'backup', label: 'Export a backup' },
      confidence: 'high',
      severity: age === null ? 2 : 1 + Math.min(2, Math.floor((age - 14) / 14)),
      source: 'backup age',
    },
  ];
}

function recoverySignals(input: CoachInput): CoachSignal[] {
  const { fatigue } = input;
  const signals: CoachSignal[] = [];
  const checkedIn = input.constraints.readiness !== null;
  // A check-in adjusts today's workout, so a finished one is not offered it.
  const finished = input.status === 'completed';
  if (fatigue.level === 'high') {
    const shorten = input.status === 'preview' && input.duration === 'default';
    signals.push({
      domain: 'recovery',
      headline: 'Recovery first today',
      why: [...fatigue.evidence.slice(0, 3)],
      action: shorten
        ? {
            kind: 'recalibrate',
            trigger: { type: 'duration', choice: 45 },
            label: 'Fit to 45 min at held loads',
          }
        : checkedIn || finished
          ? null
          : { kind: 'readiness', label: 'Quick check-in' },
      confidence: 'medium',
      severity: 3,
      source: 'fatigue',
    });
  } else if (fatigue.level === 'elevated') {
    signals.push({
      domain: 'recovery',
      headline: 'Fatigue is building',
      why: [
        ...fatigue.evidence.slice(0, 2),
        'Loads hold where reps were tight; nothing is added today.',
      ],
      action: checkedIn || finished ? null : { kind: 'readiness', label: 'Quick check-in' },
      confidence: 'medium',
      severity: 1,
      source: 'fatigue',
    });
  }
  return signals;
}

function actionForInsight(input: CoachInput, insight: StrategyInsight): CoachAction | null {
  const entry = insight.exerciseId ? liveEntryFor(input, insight.exerciseId) : undefined;
  // A finished workout takes no change to today: only a note, or a focus for the next session.
  const finished = input.status === 'completed';
  const untouched = entry !== undefined && !started(input, entry) && !finished;
  const exercise = insight.exerciseId ? requireExercise(insight.exerciseId) : null;
  switch (insight.recommendation) {
    case 'add-weight':
    case 'micro-deload': {
      // A weight the place makes, never one it does not (Maintenance 24).
      const step = loadOfferStep(input, insight);
      if (!entry || !untouched || !step) return null;
      const { weight } = step;
      const units = input.profile.units;
      return insight.recommendation === 'add-weight'
        ? {
            kind: 'recalibrate',
            trigger: { type: 'target-weight', entryId: entry.id, weight },
            label: `Take ${weight} ${units} today`,
          }
        : {
            kind: 'recalibrate',
            trigger: { type: 'target-weight', entryId: entry.id, weight },
            label: `Micro-deload to ${weight} ${units}`,
            major: true,
          };
    }
    case 'add-reps': {
      if (!entry || !untouched || (exercise && isHold(exercise))) return null;
      const first = workingSets(entry).find((set) => set.kind === 'working');
      if (!first) return null;
      return {
        kind: 'recalibrate',
        trigger: {
          type: 'rep-range',
          entryId: entry.id,
          reps: [first.targetReps[0] + 1, first.targetReps[1] + 1],
        },
        label: 'Aim one rep higher',
      };
    }
    case 'increase-rest':
      if (!entry || finished) return null;
      return {
        kind: 'recalibrate',
        trigger: { type: 'rest-adjust', entryId: entry.id, deltaSeconds: 30 },
        label: 'Rest 30 s longer',
      };
    case 'adjust-volume': {
      const muscle = insight.muscle;
      if (!muscle) return null;
      if (finished) {
        // A focus already set would only be saved again, its end pushed out.
        if (input.focus === muscle) return null;
        return {
          kind: 'focus',
          muscle,
          label: `Lead the next session with ${muscleName(muscle).toLowerCase()}`,
        };
      }
      // The extra set goes on direct work for the muscle. The heavy compounds that open the
      // session are the costliest place to add one and the least direct, so they never take
      // it; neither does an exercise whose sets were already changed today.
      const candidates = allEntries(input.workout.blocks).filter((candidate) => {
        if (isStopped(candidate) || started(input, candidate) || candidate.manual?.sets) {
          return false;
        }
        if (candidate.role === 'primary-strength' || candidate.role === 'secondary-strength')
          return false;
        return requireExercise(candidate.exerciseId).primaryMuscles.includes(muscle);
      });
      const rank = (candidate: WorkoutEntry) => {
        const exercise = requireExercise(candidate.exerciseId);
        return (exercise.primaryMuscles[0] === muscle ? 0 : 2) + (exercise.compound ? 1 : 0);
      };
      const target = [...candidates].sort((a, b) => rank(a) - rank(b))[0];
      if (target) {
        return {
          kind: 'recalibrate',
          trigger: { type: 'sets', entryId: target.id, workingDelta: 1 },
          label: `Add a set to ${requireExercise(target.exerciseId).name}`,
        };
      }
      // Nothing direct today: two sets of an accessory when there is room, else the next session.
      return (
        accessoryActionFor(input, muscle) ?? {
          kind: 'focus',
          muscle,
          label: `Lead the next session with ${muscleName(muscle).toLowerCase()}`,
        }
      );
    }
    case 'open-alternatives':
      if (!entry || !untouched) return null;
      return { kind: 'alternatives', entryId: entry.id, label: 'Open alternatives' };
    case 'hold':
    default:
      return null;
  }
}

/**
 * Minutes of today's length not yet spoken for: the length, less what the clock has used, less
 * everything still to do (the general warm-up included until the first set is logged). Counting
 * only the work still to do made the room grow as the workout went on.
 */
function spareMinutes(input: CoachInput): number {
  const keys = doneKeys(input.completed);
  const elapsed = input.elapsedSeconds ?? 0;
  const left = remainingMinutes({
    blocks: input.workout.blocks,
    exerciseOf: requireExercise,
    isDone: (id, index) => keys.has(`${id}:${index}`),
    generalWarmupMinutes: input.workout.warmup.generalMinutes,
    anythingLogged: input.completed.sets.length > 0,
    elapsedSeconds: elapsed,
    restSecondsLeft: 0,
  });
  return input.workout.duration.targetMinutes - elapsed / 60 - left;
}

/** Two sets of the best accessory for a muscle, when today still has room for them. */
function accessoryActionFor(input: CoachInput, muscle: MuscleId): CoachAction | null {
  const entries = allEntries(input.workout.blocks);
  if (spareMinutes(input) < ROOM_MINUTES) return null;
  const accessory = pickAccessoryFor(
    muscle,
    entries.map((entry) => requireExercise(entry.exerciseId)),
    accessoryPicker({
      profile: input.profile,
      location: input.location,
      constraints: {
        excludeExerciseIds: input.constraints.avoidExerciseIds,
        unavailableEquipment: input.constraints.busyEquipment,
        painJoints: jointsToProtect(input),
      },
      history: input.history,
      now: input.now,
      focus: input.focus ?? null,
      swaps: input.swaps,
    }),
  );
  if (!accessory) return null;
  return {
    kind: 'recalibrate',
    trigger: { type: 'add-exercise', exerciseId: accessory.id, muscle, sets: 2 },
    label: `Add 2 sets of ${accessory.name}`,
  };
}

function strategySignals(input: CoachInput): CoachSignal[] {
  const domainOf = (insight: StrategyInsight): CoachDomain =>
    insight.kind === 'fit'
      ? 'fit'
      : insight.kind === 'coverage'
        ? 'coverage'
        : insight.kind === 'fatigue' || insight.kind === 'recovery'
          ? 'recovery'
          : 'plateau';
  return (
    input.strategy
      // A step the place cannot make, or one the plan took itself, leaves the card out: the
      // plan's own note says what it did (Maintenance 24).
      .filter((insight) => {
        const step = loadOfferStep(input, insight);
        return step !== null && step?.taken !== true;
      })
      .map((insight): CoachSignal => ({
        domain: domainOf(insight),
        headline: insight.headline,
        why: loadWhy(input, insight),
        action: actionForInsight(input, insight),
        confidence: insight.confidence,
        severity: insight.severity,
        source: `strategy: ${insight.kind}`,
        exerciseId: insight.exerciseId,
        obvious: insight.recommendation === 'add-weight' || insight.recommendation === 'add-reps',
      }))
      // A coverage note with nothing to tap is the conductor's job, not a card.
      .filter((signal) => !(signal.domain === 'coverage' && signal.action === null))
  );
}

/**
 * The weight a load insight names at the place today (Maintenance 24): the plan's next step up or
 * its micro-deload, onto a weight made there. Null when the place makes none, and then the card is
 * left out, the lift under way or not, rather than shown with a step the app cannot take here;
 * undefined for any other insight, or a lift with no weight today.
 */
function loadOfferStep(input: CoachInput, insight: StrategyInsight): PlaceStep | null | undefined {
  const load = insight.recommendation === 'add-weight' || insight.recommendation === 'micro-deload';
  const entry = load && insight.exerciseId ? liveEntryFor(input, insight.exerciseId) : undefined;
  if (!entry || !loadsOf(entry)) return undefined;
  const exercise = requireExercise(entry.exerciseId);
  return insight.recommendation === 'add-weight'
    ? heavierHere(input, exercise, entry)
    : lighterHere(input, exercise, entry);
}

/**
 * A load card's why (Maintenance 24): where the place moves the plan's step onto a weight it makes,
 * the step names that weight, so the reason and the button agree.
 */
function loadWhy(input: CoachInput, insight: StrategyInsight): string[] {
  const offer = loadOfferStep(input, insight);
  if (!offer || offer.taken) return insight.why;
  const units = input.profile.units;
  if (insight.recommendation === 'add-weight') {
    if (Math.abs(offer.weight - offer.step) < 1e-6) return insight.why;
    return [
      ...insight.why.slice(0, -1),
      `Next step: ${offer.weight} ${units}, the nearest weight here, then work back up the range.`,
    ];
  }
  // The card's own line names a tenth off; a bigger cut, at a light weight or onto the weights
  // here, says how big.
  const cut = Math.round((1 - offer.weight / offer.base) * 100);
  if (cut <= 12) return insight.why;
  return [
    ...insight.why.slice(0, -1),
    `${offer.weight} ${units}, ${cut}% lighter, rebuilds the reps before adding load again.`,
  ];
}

/** Where the fewer-reps offer comes from; a decline is remembered per lift. */
export const FEWER_REPS_SOURCE = 'fewer reps';

/**
 * A lift done at bodyweight that ended under the bottom of its range twice or more: the same
 * work in one more set of fewer reps. The swap is named only when a listed alternative with a
 * load fits this place and is not already in today's workout.
 */
function fewerRepsOffer(input: CoachInput, entry: WorkoutEntry): CoachSignal | null {
  const progression = entry.progression;
  const short = progression?.short;
  if (!progression || !short || short.sessions < 2) return null;
  const exercise = requireExercise(entry.exerciseId);
  const working = workingSets(entry).filter((set) => set.kind === 'working');
  const first = working[0];
  if (!first || first.targetWeight !== null || isHold(exercise)) return null;
  if (started(input, entry) || entry.manual?.reps || entry.manual?.sets) return null;
  const floor = first.targetReps[0];
  // Only when the floor missed is today's floor: a different range today is a different target.
  if (floor !== short.floor || floor < 3 || working.length >= MAX_WORKING_SETS) return null;
  const reps: [number, number] = [Math.max(1, floor - 3), floor - 1];
  const today = new Set(allEntries(input.workout.blocks).map((candidate) => candidate.exerciseId));
  const context = sessionConflictContext(input.profile, input.location, {
    excludeExerciseIds: input.constraints.avoidExerciseIds,
    unavailableEquipment: input.constraints.busyEquipment,
    painJoints: jointsToProtect(input),
  });
  // Never one the lifter swapped out for weeks.
  const swappedOut = swappedOutIds(input.swaps ?? [], context);
  const swap = exercise.substitutions
    .map((id) => getExercise(id))
    .find(
      (candidate) =>
        candidate !== undefined &&
        startRatio(candidate) !== null &&
        !today.has(candidate.id) &&
        !swappedOut.has(candidate.id) &&
        !checkExerciseFit(candidate, context).some((conflict) => conflict.severity === 'block'),
    );
  return {
    domain: 'progression',
    headline:
      short.sessions >= 3
        ? `${exercise.name}: short of ${short.floor} reps ${short.sessions} sessions running`
        : `${exercise.name}: short of ${short.floor} reps twice in a row`,
    why: [
      ...progression.evidence.slice(0, 1),
      swap
        ? `Do fewer reps over more sets, or swap in ${swap.name} for a few weeks.`
        : 'Do fewer reps over more sets.',
    ],
    action: {
      kind: 'recalibrate',
      trigger: { type: 'rep-range', entryId: entry.id, reps, workingDelta: 1 },
      label: `${working.length + 1} sets of ${reps[0]}-${reps[1]} today`,
    },
    confidence: progression.confidence,
    severity: 2,
    source: FEWER_REPS_SOURCE,
    exerciseId: entry.exerciseId,
  };
}

function progressionSignals(input: CoachInput): CoachSignal[] {
  const signals: CoachSignal[] = [];
  const units = input.profile.units;
  const leanDown = resolveStyle(input.profile) === 'lean-down';
  // A finished workout takes no more "today" offers: a tap there would change nothing.
  const finished = input.status === 'completed';
  let lowered = false;
  let offered = false;
  for (const entry of remainingEntries(input)) {
    const progression = entry.progression;
    if (!progression || progression.mode === 'start') continue;
    const exercise = requireExercise(entry.exerciseId);
    const load = workingSets(entry).find((set) => set.kind === 'working')?.targetWeight ?? null;
    // A lowered load is a must-know: the plan already changed, and the card says why. With no
    // load there is nothing lowered, whatever an older copy of the plan says.
    if (
      !lowered &&
      load !== null &&
      (progression.mode === 'deload' || progression.mode === 'regress')
    ) {
      const note: CoachSignal = {
        domain: 'progression',
        headline: `${exercise.name}: ${progression.mode === 'deload' ? 'micro-deload' : 'reset and rebuild'}${
          load === null ? '' : ` to ${load} ${units}`
        }`,
        why: progression.evidence.slice(0, 3),
        action: null,
        confidence: progression.confidence,
        severity: 2,
        source: 'progression',
        exerciseId: entry.exerciseId,
      };
      signals.push(note);
      // One set aside with Not now leaves the place to the next lift's lowered load.
      lowered = !putAway(input, note);
    }
    // A lift done at bodyweight that keeps falling short has no weight to take off: fewer reps
    // over more sets is the one tap (Maintenance 21).
    // One offer per lift: a lift whose offer was put away is not offered the next thing instead.
    let thisLift = false;
    const fewer: CoachSignal | null = !offered && !finished ? fewerRepsOffer(input, entry) : null;
    if (fewer) {
      signals.push(fewer);
      thisLift = true;
      // A declined or taken offer holds no place: the next lift's offer can still show.
      offered = !putAway(input, fewer);
    }
    // An extra set on offer ends in a tap. Not while losing fat: more sets kept no more muscle
    // in a deficit (Roth et al., 2023), so the plan holds its volume.
    if (
      !offered &&
      !thisLift &&
      !finished &&
      !leanDown &&
      progression.setsAdvice === 1 &&
      !started(input, entry) &&
      !entry.manual?.sets
    ) {
      const extra: CoachSignal = {
        domain: 'progression',
        headline: `${exercise.name}: an extra set is on the table`,
        why: [
          progression.evidence.find((line) => /extra set/i.test(line)) ??
            'Two sessions at the top of the range.',
          'One more working set adds the volume without touching the load.',
        ],
        action: {
          kind: 'recalibrate',
          trigger: { type: 'sets', entryId: entry.id, workingDelta: 1 },
          label: 'Add the set',
        },
        confidence: progression.confidence,
        severity: 1,
        source: 'extra set',
        exerciseId: entry.exerciseId,
      };
      signals.push(extra);
      thisLift = true;
      offered = !putAway(input, extra);
    }
    // Held at the heaviest weight the place has: the reps are already climbing; the next
    // levers are a harder variation, then an extra set. Each ends in a tap.
    // A hold's seconds already climb on their own rule, so the rep levers here do not apply.
    if (
      !offered &&
      !thisLift &&
      !finished &&
      progression.capped &&
      !started(input, entry) &&
      !isHold(exercise)
    ) {
      const top = workingSets(entry).find((set) => set.kind === 'working')?.targetReps[1] ?? 0;
      // The reps stop at twenty, or at thirty on a set run to its effort (Maintenance 23). An
      // exercise whose sets were already changed today is not offered another one.
      const ceiling = entryPushedToEffort(entry) ? EFFORT_REPS_CEILING : 20;
      const repsAtCeiling = top >= ceiling && !entry.manual?.sets;
      const capped: CoachSignal = {
        domain: 'progression',
        headline: `${exercise.name}: at the heaviest weight here (${progression.capped.at} ${units})`,
        why: [
          repsAtCeiling
            ? 'The reps are already at the top of the range.'
            : `The reps go up instead, to ${top} this session.`,
          repsAtCeiling
            ? 'One more working set adds volume the weight cannot.'
            : 'A harder variation keeps the same weight heavy.',
        ],
        action: repsAtCeiling
          ? {
              kind: 'recalibrate',
              trigger: { type: 'sets', entryId: entry.id, workingDelta: 1 },
              label: 'Add a set',
            }
          : { kind: 'alternatives', entryId: entry.id, label: 'A harder variation' },
        confidence: progression.confidence,
        severity: 1,
        source: 'capped',
        exerciseId: entry.exerciseId,
      };
      signals.push(capped);
      offered = !putAway(input, capped);
    }
  }
  return signals;
}

function restSignals(input: CoachInput): CoachSignal[] {
  if (input.status !== 'active') return [];
  const entryId = input.completed.currentEntryId;
  if (!entryId) return [];
  const logged = input.completed.sets.filter(
    (set) => set.entryId === entryId && set.kind === 'working' && !set.skipped,
  );
  if (logged.length < 2) return [];
  const [previous, latest] = logged.slice(-2) as [(typeof logged)[number], (typeof logged)[number]];
  // A shorter second hold is how holds go; it says nothing about the rest.
  if (isHold(requireExercise(latest.exerciseId))) return [];
  if (previous.reps - latest.reps >= 2 && (latest.rir ?? 1) <= 0) {
    const name = requireExercise(latest.exerciseId).name;
    return [
      {
        domain: 'rest',
        headline: `Rest 30 s longer before the next ${name} set`,
        why: [
          `Reps fell from ${previous.reps} to ${latest.reps} with nothing in reserve.`,
          'A longer rest keeps the next set in range instead of grinding.',
        ],
        action: { kind: 'rest', deltaSeconds: 30, label: 'Add 30 s to this rest' },
        confidence: 'medium',
        severity: 2,
        source: 'in-session reps',
      },
    ];
  }
  return [];
}

/** A muscle under this share of its weekly target counts as a gap. */
const COVERAGE_GAP = 0.4;
/** Minutes of room today before two sets of an accessory are offered. */
const ROOM_MINUTES = 4;

/**
 * Coverage that acts or stays quiet. The card fires only once half the week's
 * sessions are done, for a muscle still under 40 percent of its target with
 * nothing for it today, and only when no session still to come this week
 * reaches it. With room today the tap adds two sets of the best accessory;
 * without room it sets a focus so the next session leads with the muscle.
 */
function coverageSignals(input: CoachInput): CoachSignal[] {
  if (input.status === 'completed') return [];
  const exposure = computeExposure(input.history, input.now);
  if (exposure.sessionsLast14Days < 2) return [];
  const planned = input.profile.schedule.weeklyFrequency;
  const doneThisWeek = input.history.filter(
    (record) =>
      Date.parse(input.now) - Date.parse(record.completedAt ?? record.startedAt) <= 7 * DAY_MS,
  ).length;
  if (doneThisWeek < Math.ceil(planned / 2)) return [];
  const volume = computeWeeklyVolume(input.history, input.now);
  const priorities = computeMusclePriorities(input.profile, volume, exposure);
  const entries = allEntries(input.workout.blocks);
  const covered = new Set(
    entries.flatMap((entry) => requireExercise(entry.exerciseId).primaryMuscles),
  );
  const gap = priorities.find(
    (priority) =>
      priority.weeklyTarget > 0 &&
      priority.weeklySetsDone / priority.weeklyTarget < COVERAGE_GAP &&
      priority.weight >= 1.1 &&
      !covered.has(priority.muscle),
  );
  if (!gap) return [];
  const left = Math.max(0, planned - doneThisWeek - 1);
  const later = (input.upcoming ?? []).filter((session) => !session.today).slice(0, left);
  if (later.some((session) => session.muscles.includes(gap.muscle))) return [];
  if (input.focus === gap.muscle) return [];

  const name = muscleName(gap.muscle);
  const spare = spareMinutes(input);
  const why = [
    `${gap.weeklySetsDone} of ${gap.weeklyTarget} weekly sets so far and nothing for it today.`,
  ];
  const base = {
    domain: 'coverage' as const,
    headline: `${name} ${muscleVerb(gap.muscle)} under target this week`,
    confidence: 'medium' as const,
    severity: 1,
    source: 'weekly coverage',
  };
  const accessory =
    spare >= ROOM_MINUTES
      ? pickAccessoryFor(
          gap.muscle,
          entries.map((entry) => requireExercise(entry.exerciseId)),
          accessoryPicker({
            profile: input.profile,
            location: input.location,
            constraints: {
              excludeExerciseIds: input.constraints.avoidExerciseIds,
              unavailableEquipment: input.constraints.busyEquipment,
              painJoints: jointsToProtect(input),
            },
            history: input.history,
            now: input.now,
            focus: input.focus ?? null,
            swaps: input.swaps,
          }),
        )
      : undefined;
  if (accessory) {
    return [
      {
        ...base,
        why: [
          ...why,
          `About ${Math.round(spare)} min of room today: two sets of ${accessory.name} close most of the gap.`,
        ],
        action: {
          kind: 'recalibrate',
          trigger: { type: 'add-exercise', exerciseId: accessory.id, muscle: gap.muscle, sets: 2 },
          label: `Add 2 sets of ${accessory.name}`,
        },
      },
    ];
  }
  return [
    {
      ...base,
      why: [
        ...why,
        `No room today and no session left this week reaches ${name.toLowerCase()}; the next session can lead with ${muscleVerb(gap.muscle, 'it', 'them')}.`,
      ],
      action: {
        kind: 'focus',
        muscle: gap.muscle,
        label: `Lead the next session with ${name.toLowerCase()}`,
      },
    },
  ];
}

function tipSignals(input: CoachInput): CoachSignal[] {
  const signals: CoachSignal[] = [];
  if (
    input.profile.techniques.dropSets &&
    input.status !== 'completed' &&
    allowsFailure(resolveStyle(input.profile))
  ) {
    const volume = computeWeeklyVolume(input.history, input.now);
    const exposure = computeExposure(input.history, input.now);
    const priorities = computeMusclePriorities(input.profile, volume, exposure);
    const deficit = new Map(priorities.map((priority) => [priority.muscle, priority]));
    const alreadyPlanned = allEntries(input.workout.blocks).some((entry) => entry.dropSet);
    const spare = spareMinutes(input);
    const candidate = !alreadyPlanned
      ? remainingEntries(input).find((entry) => {
          const exercise = requireExercise(entry.exerciseId);
          const muscle = deficit.get(entry.chosenFor[0] as never);
          return (
            exercise.dropSetSafe &&
            (entry.role === 'isolation' || entry.role === 'finisher') &&
            !entryPushedToEffort(entry) &&
            !started(input, entry) &&
            muscle !== undefined &&
            muscle.weeklyTarget > 0 &&
            muscle.weeklySetsDone / muscle.weeklyTarget < 0.7
          );
        })
      : undefined;
    if (candidate && spare >= 2) {
      const name = requireExercise(candidate.exerciseId).name;
      signals.push({
        domain: 'tips',
        headline: `Optional drop set on ${name}`,
        why: [
          `${muscleName(candidate.chosenFor[0] as never)} still needs weekly volume and ${name} is drop-set safe.`,
          `About ${Math.round(spare)} min of slack in the plan; strip 20% after the last set and go.`,
        ],
        action: {
          kind: 'recalibrate',
          trigger: { type: 'drop-set', entryId: candidate.id, on: true },
          label: 'Add the drop set',
        },
        confidence: 'medium',
        severity: 1,
        source: 'drop-set opportunity',
        exerciseId: candidate.exerciseId,
      });
    }
  }
  return signals;
}

/** Whether a route passed over a step it could not give (Maintenance 24). */
function passedOver(route: CoachRoute): boolean {
  return ROUTE_STEPS.some(
    (_, index) => index < route.step && !route.applied.some((entry) => entry.step === index),
  );
}

function routeAction(
  input: CoachInput,
  entry: WorkoutEntry | undefined,
  route: CoachRoute,
): { action: CoachAction | null; explain: string; blocked?: boolean; taken?: boolean } {
  const exercise = requireExercise(route.exerciseId);
  const units = input.profile.units;
  const ref = { exerciseId: route.exerciseId, step: route.step, baselineE1rm: route.baselineE1rm };
  // A finished workout cannot take a route step: the tap would record a step never applied.
  const usable = entry !== undefined && !started(input, entry) && input.status !== 'completed';
  const first = entry ? workingSets(entry).find((set) => set.kind === 'working') : undefined;
  const applied = route.applied.find((entry) => entry.step === route.step);
  if (applied && !route.exhausted) {
    const policy = input.policy ?? coachingPolicy(input.profile.experience);
    return {
      action: null,
      explain: `Step ${route.step + 1} is in place since ${new Date(applied.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}; the next ${policy.exposuresPerRouteStep} exposures decide whether it moved the max.`,
    };
  }
  if (route.exhausted) {
    return {
      action:
        entry && usable
          ? {
              kind: 'alternatives',
              entryId: entry.id,
              label: 'Pick a different exercise',
              route: ref,
            }
          : null,
      explain: passedOver(route)
        ? 'The steps taken did not move the max, and the others were passed over where the weights could not give them: change the exercise for this pattern for a block.'
        : 'Every step was tried without the max moving: change the exercise for this pattern for a block.',
    };
  }
  const step = ROUTE_STEPS[route.step];
  switch (step) {
    case 'rep-range': {
      // Weights well short of the load the sets stand in for cannot follow a new rep range: the
      // step is passed over here (Maintenance 24).
      if (
        first?.asked !== undefined &&
        first.targetWeight !== null &&
        first.targetWeight < first.asked.weight * WELL_SHORT
      ) {
        return {
          action: null,
          explain: 'Step 1, a new rep range, needs weights this place does not make.',
          blocked: true,
        };
      }
      // A set a little short of its load reads the range it stands in for, not its extra reps.
      const current = first?.asked?.reps ?? first?.targetReps ?? exercise.repRanges.hypertrophy;
      const strengthRange = exercise.repRanges.strength ?? exercise.repRanges.hypertrophy;
      const target: [number, number] =
        current[0] === strengthRange[0] && current[1] === strengthRange[1]
          ? exercise.repRanges.hypertrophy
          : strengthRange;
      const same = target[0] === current[0] && target[1] === current[1];
      const reps: [number, number] = same ? [current[0] + 2, current[1] + 2] : target;
      return {
        action:
          entry && usable
            ? {
                kind: 'recalibrate',
                trigger: { type: 'rep-range', entryId: entry.id, reps },
                label: `Shift to ${reps[0]}-${reps[1]} reps for two weeks`,
                route: ref,
              }
            : null,
        explain: `Step 1: a different rep range gives the lift a new stimulus at the same effort.`,
      };
    }
    case 'variation':
      return {
        action:
          entry && usable
            ? { kind: 'alternatives', entryId: entry.id, label: 'Swap for a variation', route: ref }
            : null,
        explain:
          'Step 2: a variation of the same pattern moves the weak point without losing the lift.',
      };
    case 'deload': {
      const current = first?.targetWeight ?? null;
      // A weight the place makes; with nothing lighter here the step is passed over, and a deload
      // the plan took itself this week leaves the card out (Maintenance 24).
      const lighter = current === null || !entry ? null : lighterHere(input, exercise, entry);
      if (current !== null && lighter === null) {
        return {
          action: null,
          explain: 'Step 3, a short deload, needs a lighter weight than this place makes.',
          blocked: true,
        };
      }
      if (lighter?.taken) return { action: null, explain: '', taken: true };
      return {
        action:
          entry && usable && lighter
            ? {
                kind: 'recalibrate',
                trigger: { type: 'target-weight', entryId: entry.id, weight: lighter.weight },
                label: `Deload to ${lighter.weight} ${units} this week`,
                major: true,
                route: ref,
              }
            : null,
        explain: 'Step 3: a short deload sheds fatigue that hides progress.',
      };
    }
    case 'volume':
    default:
      return {
        action:
          entry && usable
            ? {
                kind: 'recalibrate',
                trigger: { type: 'sets', entryId: entry.id, workingDelta: 1 },
                label: 'Add a working set',
                route: ref,
              }
            : null,
        explain: 'Step 4: one more working set adds the volume a stalled lift often needs.',
      };
  }
}

function plateauSignals(input: CoachInput, policy: CoachingPolicy): CoachSignal[] {
  const stalls = input.stalls ?? detectStalls(input.history, input.profile, policy);
  const routes = input.routes ?? emptyRoutes();
  const signals: CoachSignal[] = [];
  for (const stall of stalls) {
    const exercise = requireExercise(stall.exerciseId);
    const entry = liveEntryFor(input, stall.exerciseId);
    if (stall.kind === 'undershooting') {
      const first = entry ? workingSets(entry).find((set) => set.kind === 'working') : undefined;
      const current = first?.targetWeight ?? null;
      const open = entry !== undefined && !started(input, entry) && input.status !== 'completed';
      // The plan's next step at the place; where it makes none, no step to offer, the lift under
      // way or not, and where the plan took it itself, its own note says so (Maintenance 24).
      const heavier = current === null || !entry ? null : heavierHere(input, exercise, entry);
      if (current !== null && (heavier === null || heavier.taken)) continue;
      signals.push({
        domain: 'plateau',
        headline: `${exercise.name}: ${stall.exposures} exposures without progress, sets ending too easy`,
        why: [...stall.why, 'Work to the prescribed effort, or take the next load step now.'],
        action:
          entry && open && heavier
            ? {
                kind: 'recalibrate',
                trigger: { type: 'target-weight', entryId: entry.id, weight: heavier.weight },
                label: `Take ${heavier.weight} ${input.profile.units} today`,
              }
            : null,
        confidence: 'medium',
        severity: 2,
        source: 'stall: undershooting',
        exerciseId: stall.exerciseId,
      });
      continue;
    }
    const route: CoachRoute = routes.routes[stall.exerciseId] ?? {
      exerciseId: stall.exerciseId,
      step: 0,
      startedAt: input.now,
      baselineE1rm: stall.latestE1rm,
      applied: [],
      exhausted: false,
    };
    // A step the weights here cannot give (only a new rep range or a deload can be one) is passed
    // over: the next step is offered, and taking it moves the route on (Maintenance 24).
    let shown = route;
    let offer = routeAction(input, entry, route);
    if (offer.blocked) {
      shown = { ...route, step: route.step + 1 };
      const next = routeAction(input, entry, shown);
      offer = { action: next.action, explain: `${offer.explain} ${next.explain}` };
    }
    if (offer.taken) continue;
    signals.push({
      domain: 'plateau',
      headline: route.exhausted
        ? passedOver(route)
          ? `${exercise.name}: the route is done, still stalled`
          : `${exercise.name}: every route step tried, still stalled`
        : `${exercise.name} has stalled for ${stall.exposures} exposures${
            stall.effortUnknown < stall.exposures ? ' at the prescribed effort' : ''
          }`,
      why: [stall.why[0] as string, `Route: ${describeRoute(shown)}.`, offer.explain],
      action: offer.action,
      confidence: stall.effortUnknown === 0 ? 'high' : 'medium',
      severity: route.exhausted ? 3 : 2,
      source: 'stall: route',
      exerciseId: stall.exerciseId,
    });
  }
  return signals;
}

/** Sources of the two style offers; a decline is remembered per source. */
export const STYLE_GOALS_SOURCE = 'style: goals';
export const STYLE_UNDULATING_SOURCE = 'style: undulating';

/**
 * The programming style, as an offer. A profile from before Auto existed is
 * offered it once: the goals and settings pick the style, and the card says
 * which one they point to and why. And when several lifts are stuck at a fixed
 * rep range, rotating the ranges is offered, with the research and its limits.
 * A style change rebuilds the plan, so neither is offered once a workout is
 * under way, and a style the lifter picked by hand is never second-guessed.
 */
function styleSignals(input: CoachInput): CoachSignal[] {
  if (input.status !== 'preview') return [];
  const profile = input.profile;
  const signals: CoachSignal[] = [];
  if (profile.programStyle === undefined) {
    const advice = adviseStyle(profile);
    const advised = styleInfo(advice.style);
    const current = styleInfo(profile.trainingStyle);
    const differs = advice.style !== profile.trainingStyle;
    const research = leadEvidence(advice.style);
    signals.push({
      domain: differs ? 'progression' : 'tips',
      headline: differs
        ? `Your goals point to ${advised.name}, not ${current.name}`
        : 'Your goals can pick the programming style',
      why: differs
        ? [advice.reasons[0] as string, research]
        : [
            `They point to ${advised.name}, the style you have now, and the plan follows if your goals change.`,
            research,
          ],
      action: { kind: 'style', style: 'auto', label: 'Let my goals choose' },
      confidence: 'high',
      severity: 1,
      source: STYLE_GOALS_SOURCE,
    });
  }
  const stuck = undulatingCase(profile, input.stalls ?? []);
  if (stuck.length > 0) {
    const names = stuck.slice(0, 3).map((stall) => requireExercise(stall.exerciseId).name);
    signals.push({
      domain: 'plateau',
      headline: `${stuck.length} lifts have stalled at a fixed rep range`,
      // Two lines, so the limits of the research are on the card at every experience level.
      why: [
        `${names.join(', ')}${stuck.length > names.length ? ' and more' : ''}: no better estimated max in weeks, at the prescribed effort.`,
        'Rotating the rep range built more max strength in trained lifters (Moesgaard 2022). The evidence is mixed (ACSM 2026), and nothing is given up for size.',
      ],
      action: { kind: 'style', style: 'undulating', label: 'Rotate the rep ranges' },
      confidence: 'medium',
      severity: 3,
      source: STYLE_UNDULATING_SOURCE,
    });
  }
  return signals;
}

export function gatherSignals(rawInput: CoachInput): CoachSignal[] {
  const policy = rawInput.policy ?? coachingPolicy(rawInput.profile.experience);
  // Stalls are read once: the plateau routes and the style offer both start from them.
  const input: CoachInput = {
    ...rawInput,
    stalls: rawInput.stalls ?? detectStalls(rawInput.history, rawInput.profile, policy),
  };
  const signals = [
    ...safetySignals(input),
    ...unfinishedSignals(input),
    ...saveSignals(input),
    ...recoverySignals(input),
    ...plateauSignals(input, policy),
    ...styleSignals(input),
    ...strategySignals(input),
    ...progressionSignals(input),
    ...restSignals(input),
    ...coverageSignals(input),
    ...tipSignals(input),
  ];
  return inDeloadWeek(input) ? signals.filter((signal) => !pushesForMore(signal)) : signals;
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;

/**
 * Picks the one card: highest-priority domain first, then severity, then whether it has
 * something to tap, then confidence. The coach talks only about the workout on the screen
 * (Maintenance 21): a note about a lift that is not in it waits for a day that has it, while
 * notes about the whole day, week or programme always count.
 */
export function conductCoach(input: CoachInput): CoachCard | null {
  const policy = input.policy ?? coachingPolicy(input.profile.experience);
  const today = new Set(allEntries(input.workout.blocks).map((entry) => entry.exerciseId));
  const all = gatherSignals(input).filter(
    (signal) =>
      (signal.exerciseId === undefined || today.has(signal.exerciseId)) &&
      !isDeclined(input.declines, signal, input.now) &&
      !isAccepted(input.accepted, signal) &&
      !isSetAside(input.accepted, signal),
  );
  const signals = policy.hideObvious ? all.filter((signal) => !signal.obvious) : all;
  if (signals.length === 0) return null;
  const ranked = [...signals].sort(
    (a, b) =>
      DOMAIN_PRIORITY.indexOf(a.domain) - DOMAIN_PRIORITY.indexOf(b.domain) ||
      b.severity - a.severity ||
      Number(b.action !== null) - Number(a.action !== null) ||
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      a.headline.localeCompare(b.headline),
  );
  const winner = ranked[0] as CoachSignal;
  return {
    signal: { ...winner, why: winner.why.slice(0, policy.whyLines) },
    considered: all.length,
    domains: [...new Set(signals.map((signal) => signal.domain))],
    policy,
  };
}
