import { requireExercise } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { muscleName } from '../../catalog/muscles/muscles';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { estimateWorkout } from '../duration/duration';
import { weightStep } from '../plateMath/plateMath';
import type {
  CompletedWork,
  RecalibrationTrigger,
  SessionConstraints,
} from '../recalibration/types';
import type { FatigueSignal } from '../recovery/fatigue';
import type { StrategyInsight } from '../strategy/strategy';
import {
  computeExposure,
  computeMusclePriorities,
  computeWeeklyVolume,
} from '../volume/weeklyVolume';
import { currentPosition } from '../workout/sequence';
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

export type CoachAction =
  | { kind: 'recalibrate'; trigger: RecalibrationTrigger; label: string; major?: boolean }
  | { kind: 'rest'; deltaSeconds: number; label: string }
  | { kind: 'readiness'; label: string }
  | { kind: 'alternatives'; entryId: string; label: string }
  | { kind: 'backup'; label: string };

export interface CoachSignal {
  domain: CoachDomain;
  headline: string;
  why: string[];
  action: CoachAction | null;
  confidence: 'low' | 'medium' | 'high';
  severity: number;
  source: string;
}

export interface CoachCard {
  signal: CoachSignal;
  considered: number;
  domains: CoachDomain[];
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
          `${name} carries moderate stress there; stop the set if it bites.`,
        ],
        action: null,
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
  return input.strategy.map((insight) => ({
    domain: domainOf(insight),
    headline: insight.headline,
    why: insight.why,
    action: actionForInsight(input, insight),
    confidence: insight.confidence,
    severity: insight.severity,
    source: `strategy: ${insight.kind}`,
  }));
}

function progressionSignals(input: CoachInput): CoachSignal[] {
  const keys = doneKeys(input.completed);
  const position = currentPosition(input.workout, (id, index) => keys.has(`${id}:${index}`));
  const block = position
    ? input.workout.blocks.find((candidate) => candidate.id === position.blockId)
    : undefined;
  const signals: CoachSignal[] = [];
  if (block && block.kind !== 'straight') {
    const lines = block.entries.map((entry) => {
      const exercise = requireExercise(entry.exerciseId);
      const evidence = entry.progression?.evidence[0] ?? 'first time logged';
      const logged = input.completed.sets.filter(
        (set) => set.entryId === entry.id && set.kind === 'working' && !set.skipped,
      );
      const today =
        logged.length > 0
          ? ` · today ${logged.map((set) => `${set.weight ?? 'bw'}×${set.reps}`).join(', ')}`
          : '';
      return `${exercise.name}: ${evidence}${today}`;
    });
    signals.push({
      domain: 'progression',
      headline: `Superset: ${block.entries.map((entry) => requireExercise(entry.exerciseId).name).join(' + ')}`,
      why: [
        ...lines,
        'Only logged rounds count; the next round starts from what you actually did.',
      ],
      action: null,
      confidence: 'medium',
      severity: 1.5,
      source: 'superset evidence',
    });
    return signals;
  }
  const next = remainingEntries(input).find(
    (entry) => entry.progression && entry.progression.mode !== 'start',
  );
  if (next?.progression) {
    const exercise = requireExercise(next.exerciseId);
    const first = workingSets(next).find((set) => set.kind === 'working');
    const load = first?.targetWeight ?? null;
    const modeLabel: Record<string, string> = {
      weight: 'load goes up',
      reps: 'reps go up',
      maintain: 'hold the load',
      deload: 'micro-deload',
      regress: 'reset and rebuild',
      sets: 'extra set on offer',
      double: 'double progression',
      start: 'first time',
    };
    signals.push({
      domain: 'progression',
      headline: `${exercise.name}: ${modeLabel[next.progression.mode] ?? next.progression.mode}${
        load === null ? '' : ` to ${load} ${input.profile.units}`
      }`,
      why: next.progression.evidence.slice(0, 3),
      action: null,
      confidence: next.progression.confidence,
      severity: next.progression.mode === 'deload' || next.progression.mode === 'regress' ? 2 : 1,
      source: 'progression',
    });
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

function coverageSignals(input: CoachInput): CoachSignal[] {
  const volume = computeWeeklyVolume(input.history, input.now);
  const exposure = computeExposure(input.history, input.now);
  const priorities = computeMusclePriorities(input.profile, volume, exposure);
  const covered = new Set(
    allEntries(input.workout.blocks).flatMap(
      (entry) => requireExercise(entry.exerciseId).primaryMuscles,
    ),
  );
  const gap = priorities.find(
    (priority) =>
      priority.weeklyTarget > 0 &&
      priority.weeklySetsDone / priority.weeklyTarget < 0.4 &&
      priority.weight >= 1.1 &&
      !covered.has(priority.muscle) &&
      exposure.sessionsLast14Days >= 2,
  );
  if (!gap) return [];
  return [
    {
      domain: 'coverage',
      headline: `${muscleName(gap.muscle)} is under target this week`,
      why: [
        `${gap.weeklySetsDone} of ${gap.weeklyTarget} weekly sets so far and nothing for it today.`,
        'The next session that leads with it will close the gap; no change to today.',
      ],
      action: null,
      confidence: 'medium',
      severity: 1,
      source: 'weekly coverage',
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
      });
    }
  }
  const anyWeights = input.history.some((record) =>
    record.entries.some((entry) => entry.sets.some((set) => set.weight !== null)),
  );
  if (!anyWeights && input.workoutCount > 0) {
    signals.push({
      domain: 'tips',
      headline: 'Log weights so targets can follow you',
      why: [
        'No weights have been logged yet.',
        'The next target for every lift is built from your last logged load.',
      ],
      action: null,
      confidence: 'high',
      severity: 0,
      source: 'logging habit',
    });
  }
  return signals;
}

export function gatherSignals(input: CoachInput): CoachSignal[] {
  return [
    ...safetySignals(input),
    ...saveSignals(input),
    ...recoverySignals(input),
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
  const signals = gatherSignals(input);
  if (signals.length === 0) return null;
  const ranked = [...signals].sort(
    (a, b) =>
      DOMAIN_PRIORITY.indexOf(a.domain) - DOMAIN_PRIORITY.indexOf(b.domain) ||
      b.severity - a.severity ||
      Number(b.action !== null) - Number(a.action !== null) ||
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      a.headline.localeCompare(b.headline),
  );
  return {
    signal: ranked[0] as CoachSignal,
    considered: signals.length,
    domains: [...new Set(signals.map((signal) => signal.domain))],
  };
}
