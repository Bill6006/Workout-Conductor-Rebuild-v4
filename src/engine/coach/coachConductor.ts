import { requireExercise } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { muscleName, muscleVerb, type MuscleId } from '../../catalog/muscles/muscles';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { estimateWorkout } from '../duration/duration';
import { weightStep } from '../plateMath/plateMath';
import type {
  CompletedWork,
  RecalibrationTrigger,
  SessionConstraints,
} from '../recalibration/types';
import type { PlannedSession } from '../planning/weeklyPlan';
import type { FatigueSignal } from '../recovery/fatigue';
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
import {
  computeExposure,
  computeMusclePriorities,
  computeWeeklyVolume,
} from '../volume/weeklyVolume';
import { accessoryPicker, pickAccessoryFor } from '../workoutGenerator/generate';
import {
  allEntries,
  workingSets,
  type DurationChoice,
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
  | { kind: 'focus'; muscle: MuscleId; label: string };

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
  workoutCount: number;
  /** Defaults derive from the profile and history; tests and the store pass them in. */
  policy?: CoachingPolicy;
  stalls?: StallDiagnosis[];
  routes?: CoachRoutes;
  declines?: CoachDeclines;
  /** The place today trains at, so the coverage action can pick an exercise that fits. */
  location?: LocationProfile;
  /** The sessions the generator would produce this week; coverage stays quiet when one reaches the muscle. */
  upcoming?: readonly PlannedSession[];
  /** The current coach focus, so it is never offered twice. */
  focus?: MuscleId | null;
}

const DAY_MS = 86_400_000;

function doneKeys(completed: CompletedWork): Set<string> {
  return new Set(completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
}

function remainingEntries(input: CoachInput): WorkoutEntry[] {
  const keys = doneKeys(input.completed);
  return allEntries(input.workout.blocks).filter((entry) =>
    entry.sets.some((set) => set.kind === 'working' && !keys.has(`${entry.id}:${set.index}`)),
  );
}

function started(input: CoachInput, entry: WorkoutEntry): boolean {
  return input.completed.sets.some((set) => set.entryId === entry.id && !set.skipped);
}

function jointLabel(joint: Joint): string {
  return joint.replace('-', ' ');
}

function safetySignals(input: CoachInput): CoachSignal[] {
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
      });
    }
  }
  const last = [...input.history].reverse()[0];
  if (last?.rating?.pain) {
    const repeated = remaining.find((entry) =>
      last.entries.some(
        (logged) =>
          logged.exerciseId === entry.exerciseId &&
          logged.sets.some((set) => set.kind === 'working' && set.completed),
      ),
    );
    if (repeated && !started(input, repeated)) {
      const name = requireExercise(repeated.exerciseId).name;
      signals.push({
        domain: 'safety',
        headline: `Pain last session: ease into ${name}`,
        why: [
          'Your last session rating reported pain.',
          `${name} was in that session; start lighter or swap it if anything hurts.`,
        ],
        action: { kind: 'alternatives', entryId: repeated.id, label: `Alternatives for ${name}` },
        confidence: 'medium',
        severity: 2,
        source: 'last rating',
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
      });
      break;
    }
  }
  return signals;
}

function saveSignals(input: CoachInput): CoachSignal[] {
  if (input.workoutCount < 3) return [];
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
        : checkedIn
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
      action: checkedIn ? null : { kind: 'readiness', label: 'Quick check-in' },
      confidence: 'medium',
      severity: 1,
      source: 'fatigue',
    });
  }
  return signals;
}

function actionForInsight(input: CoachInput, insight: StrategyInsight): CoachAction | null {
  const entry = insight.exerciseId
    ? allEntries(input.workout.blocks).find(
        (candidate) => candidate.exerciseId === insight.exerciseId,
      )
    : undefined;
  const untouched = entry !== undefined && !started(input, entry);
  const exercise = insight.exerciseId ? requireExercise(insight.exerciseId) : null;
  switch (insight.recommendation) {
    case 'add-weight': {
      if (!entry || !untouched || !exercise) return null;
      const current =
        workingSets(entry).find((set) => set.kind === 'working')?.targetWeight ?? null;
      const last = current;
      if (last === null) return null;
      const step = weightStep(exercise, input.profile.units);
      return {
        kind: 'recalibrate',
        trigger: { type: 'target-weight', entryId: entry.id, weight: last + step },
        label: `Take ${last + step} ${input.profile.units} today`,
      };
    }
    case 'micro-deload': {
      if (!entry || !untouched || !exercise) return null;
      const current =
        workingSets(entry).find((set) => set.kind === 'working')?.targetWeight ?? null;
      if (current === null) return null;
      const step = weightStep(exercise, input.profile.units);
      const lighter = Math.max(step, Math.round((current * 0.9) / step) * step);
      return {
        kind: 'recalibrate',
        trigger: { type: 'target-weight', entryId: entry.id, weight: lighter },
        label: `Micro-deload to ${lighter} ${input.profile.units}`,
        major: true,
      };
    }
    case 'add-reps': {
      if (!entry || !untouched) return null;
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
      if (!entry) return null;
      return {
        kind: 'recalibrate',
        trigger: { type: 'rest-adjust', entryId: entry.id, deltaSeconds: 30 },
        label: 'Rest 30 s longer',
      };
    case 'adjust-volume': {
      const target = insight.muscle
        ? allEntries(input.workout.blocks).find(
            (candidate) =>
              !started(input, candidate) &&
              requireExercise(candidate.exerciseId).primaryMuscles.includes(
                insight.muscle as never,
              ),
          )
        : undefined;
      if (!target) return null;
      return {
        kind: 'recalibrate',
        trigger: { type: 'sets', entryId: target.id, workingDelta: 1 },
        label: `Add a set to ${requireExercise(target.exerciseId).name}`,
      };
    }
    case 'open-alternatives':
      if (!entry || !untouched) return null;
      return { kind: 'alternatives', entryId: entry.id, label: 'Open alternatives' };
    case 'hold':
    default:
      return null;
  }
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
      .map((insight): CoachSignal => ({
        domain: domainOf(insight),
        headline: insight.headline,
        why: insight.why,
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

function progressionSignals(input: CoachInput): CoachSignal[] {
  const signals: CoachSignal[] = [];
  const units = input.profile.units;
  let lowered = false;
  let offered = false;
  for (const entry of remainingEntries(input)) {
    const progression = entry.progression;
    if (!progression || progression.mode === 'start') continue;
    const exercise = requireExercise(entry.exerciseId);
    const load = workingSets(entry).find((set) => set.kind === 'working')?.targetWeight ?? null;
    // A lowered load is a must-know: the plan already changed, and the card says why.
    if (!lowered && (progression.mode === 'deload' || progression.mode === 'regress')) {
      lowered = true;
      signals.push({
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
      });
    }
    // An extra set on offer ends in a tap.
    if (!offered && progression.setsAdvice === 1 && !started(input, entry)) {
      offered = true;
      signals.push({
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
      });
    }
    // Held at the heaviest weight the place has: the reps are already climbing; the next
    // levers are a harder variation, then an extra set. Each ends in a tap.
    if (!offered && progression.capped && !started(input, entry)) {
      offered = true;
      const top = workingSets(entry).find((set) => set.kind === 'working')?.targetReps[1] ?? 0;
      const repsAtCeiling = top >= 20;
      signals.push({
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
      });
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
  const keys = doneKeys(input.completed);
  const remaining = estimateWorkout(input.workout.blocks, 0, requireExercise, (id, index) =>
    keys.has(`${id}:${index}`),
  ).totalMinutes;
  const spare = input.workout.duration.targetMinutes - remaining;
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
              painJoints: input.constraints.painJoints,
            },
            history: input.history,
            now: input.now,
            focus: input.focus ?? null,
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
  if (input.profile.techniques.dropSets && input.status !== 'completed') {
    const keys = doneKeys(input.completed);
    const isDone = (id: string, index: number) => keys.has(`${id}:${index}`);
    const volume = computeWeeklyVolume(input.history, input.now);
    const exposure = computeExposure(input.history, input.now);
    const priorities = computeMusclePriorities(input.profile, volume, exposure);
    const deficit = new Map(priorities.map((priority) => [priority.muscle, priority]));
    const alreadyPlanned = allEntries(input.workout.blocks).some((entry) => entry.dropSet);
    const remaining = estimateWorkout(
      input.workout.blocks,
      0,
      requireExercise,
      isDone,
    ).totalMinutes;
    const spare = input.workout.duration.targetMinutes - remaining;
    const candidate = !alreadyPlanned
      ? remainingEntries(input).find((entry) => {
          const exercise = requireExercise(entry.exerciseId);
          const muscle = deficit.get(entry.chosenFor[0] as never);
          return (
            exercise.dropSetSafe &&
            (entry.role === 'isolation' || entry.role === 'finisher') &&
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

function routeAction(
  input: CoachInput,
  entry: WorkoutEntry | undefined,
  route: CoachRoute,
): { action: CoachAction | null; explain: string } {
  const exercise = requireExercise(route.exerciseId);
  const units = input.profile.units;
  const ref = { exerciseId: route.exerciseId, step: route.step, baselineE1rm: route.baselineE1rm };
  const usable = entry !== undefined && !started(input, entry);
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
      explain:
        'Every step was tried without the max moving: change the exercise for this pattern for a block.',
    };
  }
  const step = ROUTE_STEPS[route.step];
  switch (step) {
    case 'rep-range': {
      const current = first?.targetReps ?? exercise.repRanges.hypertrophy;
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
      const stepSize = weightStep(exercise, units);
      const lighter =
        current === null
          ? null
          : Math.max(stepSize, Math.round((current * 0.9) / stepSize) * stepSize);
      return {
        action:
          entry && usable && lighter !== null
            ? {
                kind: 'recalibrate',
                trigger: { type: 'target-weight', entryId: entry.id, weight: lighter },
                label: `Deload to ${lighter} ${units} this week`,
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
    const entry = allEntries(input.workout.blocks).find(
      (candidate) => candidate.exerciseId === stall.exerciseId,
    );
    const inSession = entry !== undefined;
    if (stall.kind === 'undershooting') {
      const first = entry ? workingSets(entry).find((set) => set.kind === 'working') : undefined;
      const current = first?.targetWeight ?? null;
      const stepSize = weightStep(exercise, input.profile.units);
      signals.push({
        domain: 'plateau',
        headline: `${exercise.name}: ${stall.exposures} exposures without progress, sets ending too easy`,
        why: [
          ...stall.why,
          inSession
            ? 'Work to the prescribed effort, or take the next load step now.'
            : `Applies when ${exercise.name} is next in a session.`,
        ],
        action:
          entry && !started(input, entry) && current !== null
            ? {
                kind: 'recalibrate',
                trigger: { type: 'target-weight', entryId: entry.id, weight: current + stepSize },
                label: `Take ${current + stepSize} ${input.profile.units} today`,
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
    const { action, explain } = routeAction(input, entry, route);
    signals.push({
      domain: 'plateau',
      headline: route.exhausted
        ? `${exercise.name}: every route step tried, still stalled`
        : `${exercise.name} has stalled for ${stall.exposures} exposures${
            stall.effortUnknown < stall.exposures ? ' at the prescribed effort' : ''
          }`,
      why: [
        stall.why[0] as string,
        `Route: ${describeRoute(route)}.`,
        inSession || action === null
          ? explain
          : `${explain} Applies when ${exercise.name} is next in a session.`,
      ],
      action,
      confidence: stall.effortUnknown === 0 ? 'high' : 'medium',
      severity: route.exhausted ? 3 : 2,
      source: 'stall: route',
      exerciseId: stall.exerciseId,
    });
  }
  return signals;
}

export function gatherSignals(input: CoachInput): CoachSignal[] {
  const policy = input.policy ?? coachingPolicy(input.profile.experience);
  return [
    ...safetySignals(input),
    ...saveSignals(input),
    ...recoverySignals(input),
    ...plateauSignals(input, policy),
    ...strategySignals(input),
    ...progressionSignals(input),
    ...restSignals(input),
    ...coverageSignals(input),
    ...tipSignals(input),
  ];
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;

/** Picks the one card: highest-priority domain first, then severity, then confidence. */
export function conductCoach(input: CoachInput): CoachCard | null {
  const policy = input.policy ?? coachingPolicy(input.profile.experience);
  const all = gatherSignals(input).filter(
    (signal) => !isDeclined(input.declines, signal, input.now),
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
