import type { WorkoutRecord } from '../validation/workoutRecord';

/**
 * Optional, user-triggered import of workout history from an older export.
 *
 * The app never needs an old file to build or run; this adapter only turns a
 * compatible JSON export into ordinary workout records, after a preview and a
 * confirmation, with verified writes and an undo. The accepted shape is
 * deliberately forgiving (see docs/backup-and-restore.md):
 *
 * - a top-level array of sessions, or an object holding them under
 *   `workouts`, `history`, `sessions`, or `data.workouts` / `data.history`
 * - each session: a date (`date`, `startedAt`, `start`, `completedAt`, or
 *   `timestamp`; ISO text or milliseconds), an optional `title`/`name`, an
 *   optional `unit`/`units` of `lb` or `kg`, and `exercises`/`entries`/`items`
 * - each exercise: `name`/`exercise`/`exerciseName`/`title` or an
 *   `exerciseId`/`id`, and `sets`/`logs`
 * - each set: `weight`/`load`/`lb`/`kg`, `reps`/`repetitions`, optional
 *   `rir`/`reserve`, and a warm-up flag (`warmup`, `isWarmup`, or
 *   `kind`/`type` of `warmup`)
 */

export interface LegacySet {
  weight: number | null;
  reps: number;
  rir: number | null;
  warmup: boolean;
}

export interface LegacyExercise {
  name: string;
  /** Resolved catalog id, or null when nothing in the library matches. */
  exerciseId: string | null;
  sets: LegacySet[];
}

export interface LegacySession {
  index: number;
  startedAt: string;
  completedAt: string | null;
  title: string | null;
  unit: 'lb' | 'kg' | null;
  exercises: LegacyExercise[];
}

export type LegacyParseResult =
  { ok: true; sessions: LegacySession[]; shape: string } | { ok: false; error: string };

export type ExerciseResolver = (nameOrId: string) => string | null;

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick(source: Loose, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function toIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e11 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function toUnit(value: unknown): 'lb' | 'kg' | null {
  if (typeof value !== 'string') return null;
  const lowered = value.toLowerCase();
  if (lowered === 'lb' || lowered === 'lbs' || lowered === 'pounds') return 'lb';
  if (lowered === 'kg' || lowered === 'kgs' || lowered === 'kilograms') return 'kg';
  return null;
}

/** Lowercase letters and digits only, so "Barbell Bench-Press " matches "barbell bench press". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findSessions(raw: unknown): { list: unknown[]; shape: string } | null {
  if (Array.isArray(raw)) return { list: raw, shape: 'array of sessions' };
  if (!isObject(raw)) return null;
  for (const key of ['workouts', 'history', 'sessions']) {
    if (Array.isArray(raw[key])) return { list: raw[key] as unknown[], shape: `${key} list` };
  }
  if (isObject(raw.data)) {
    for (const key of ['workouts', 'history', 'sessions']) {
      if (Array.isArray(raw.data[key])) {
        return { list: raw.data[key] as unknown[], shape: `data.${key} list` };
      }
    }
  }
  return null;
}

function parseSet(raw: unknown): LegacySet | null {
  if (!isObject(raw)) return null;
  const reps = toNumber(pick(raw, ['reps', 'repetitions', 'rep']));
  if (reps === null || reps < 0) return null;
  const weight = toNumber(pick(raw, ['weight', 'load', 'lb', 'lbs', 'kg', 'kgs']));
  const rir = toNumber(pick(raw, ['rir', 'reserve', 'repsInReserve']));
  const kind = pick(raw, ['kind', 'type', 'setType']);
  const flag = pick(raw, ['warmup', 'isWarmup', 'warmUp']);
  const warmup =
    flag === true || (typeof kind === 'string' && /warm/i.test(kind)) || flag === 'true';
  return {
    weight: weight === null ? null : Math.max(0, weight),
    reps: Math.round(reps),
    rir: rir === null ? null : Math.min(10, Math.max(0, rir)),
    warmup,
  };
}

function parseExercise(raw: unknown, resolve: ExerciseResolver): LegacyExercise | null {
  if (!isObject(raw)) return null;
  const name = pick(raw, ['name', 'exercise', 'exerciseName', 'title']);
  const id = pick(raw, ['exerciseId', 'id']);
  const label =
    typeof name === 'string' && name.trim()
      ? name.trim()
      : typeof id === 'string' && id.trim()
        ? id.trim()
        : null;
  if (!label) return null;
  const setsRaw = pick(raw, ['sets', 'logs', 'setLogs']);
  const sets = Array.isArray(setsRaw)
    ? setsRaw.map(parseSet).filter((set): set is LegacySet => set !== null)
    : [];
  const exerciseId =
    (typeof id === 'string' ? resolve(id) : null) ??
    (typeof name === 'string' ? resolve(name) : null);
  return { name: label, exerciseId, sets };
}

export function parseLegacyExport(text: string, resolve: ExerciseResolver): LegacyParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (isObject(raw) && raw.format === 'workout-conductor-backup') {
    return {
      ok: false,
      error: 'This is a current Workout Conductor backup. Use Import Full Backup JSON instead.',
    };
  }
  const found = findSessions(raw);
  if (!found) {
    return {
      ok: false,
      error:
        'No workout list found. The file needs an array of sessions, or a "workouts", "history", or "sessions" list.',
    };
  }
  const sessions: LegacySession[] = [];
  found.list.forEach((item, index) => {
    if (!isObject(item)) return;
    const startedAt = toIso(pick(item, ['startedAt', 'start', 'date', 'timestamp', 'completedAt']));
    if (!startedAt) return;
    const completedAt = toIso(pick(item, ['completedAt', 'end', 'finishedAt'])) ?? null;
    const title = pick(item, ['title', 'name']);
    const exercisesRaw = pick(item, ['exercises', 'entries', 'items']);
    const exercises = Array.isArray(exercisesRaw)
      ? exercisesRaw
          .map((exercise) => parseExercise(exercise, resolve))
          .filter((exercise): exercise is LegacyExercise => exercise !== null)
      : [];
    sessions.push({
      index,
      startedAt,
      completedAt,
      title: typeof title === 'string' && title.trim() ? title.trim() : null,
      unit: toUnit(pick(item, ['unit', 'units', 'weightUnit'])),
      exercises,
    });
  });
  if (sessions.length === 0) {
    return { ok: false, error: 'No session in the file has a readable date.' };
  }
  return { ok: true, sessions, shape: found.shape };
}

export interface LegacyImportPlan {
  records: WorkoutRecord[];
  sessionCount: number;
  setCount: number;
  matchedExercises: string[];
  skippedExercises: { name: string; sets: number }[];
  emptySessions: number;
  alreadyImported: number;
  firstDate: string | null;
  lastDate: string | null;
  unit: 'lb' | 'kg';
}

export interface PlanOptions {
  /** The profile's unit; legacy weights in the other unit are converted. */
  units: 'lb' | 'kg';
  importedAt: string;
  existingIds: ReadonlySet<string>;
}

const LB_PER_KG = 2.2046226218;

function convert(weight: number | null, from: 'lb' | 'kg' | null, to: 'lb' | 'kg'): number | null {
  if (weight === null || from === null || from === to) return weight;
  const converted = from === 'kg' ? weight * LB_PER_KG : weight / LB_PER_KG;
  return Math.round(converted * 2) / 2;
}

/** Stable id from the session's own date and position, so a second import of the same file changes nothing. */
export function legacyRecordId(session: LegacySession): string {
  return `legacy-${session.startedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${session.index}`;
}

export function planLegacyImport(
  sessions: LegacySession[],
  options: PlanOptions,
): LegacyImportPlan {
  const records: WorkoutRecord[] = [];
  const matched = new Set<string>();
  const skipped = new Map<string, number>();
  let setCount = 0;
  let emptySessions = 0;
  let alreadyImported = 0;
  const dates: string[] = [];

  for (const session of sessions) {
    const id = legacyRecordId(session);
    const entries = session.exercises.flatMap((exercise) => {
      if (!exercise.exerciseId) {
        skipped.set(exercise.name, (skipped.get(exercise.name) ?? 0) + exercise.sets.length);
        return [];
      }
      if (exercise.sets.length === 0) return [];
      matched.add(exercise.exerciseId);
      return [
        {
          exerciseId: exercise.exerciseId,
          sets: exercise.sets.map((set) => ({
            kind: set.warmup ? ('warmup' as const) : ('working' as const),
            reps: set.reps,
            weight: convert(set.weight, session.unit, options.units),
            rir: set.rir,
            completed: true,
          })),
          plannedSets: exercise.sets.filter((set) => !set.warmup).length,
        },
      ];
    });
    if (entries.length === 0) {
      emptySessions += 1;
      continue;
    }
    if (options.existingIds.has(id)) {
      alreadyImported += 1;
      continue;
    }
    setCount += entries.reduce((sum, entry) => sum + entry.sets.length, 0);
    dates.push(session.startedAt);
    records.push({
      id,
      startedAt: session.startedAt,
      completedAt: session.completedAt ?? session.startedAt,
      locationId: null,
      templateId: null,
      ...(session.title ? { title: session.title } : {}),
      entries,
      endedEarly: false,
      rating: null,
      skippedExerciseIds: [],
      painJoints: [],
      prs: [],
      source: 'legacy-import',
      importedAt: options.importedAt,
    } as unknown as WorkoutRecord);
  }

  dates.sort();
  return {
    records,
    sessionCount: sessions.length,
    setCount,
    matchedExercises: [...matched].sort(),
    skippedExercises: [...skipped.entries()]
      .map(([name, sets]) => ({ name, sets }))
      .sort((a, b) => b.sets - a.sets),
    emptySessions,
    alreadyImported,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    unit: options.units,
  };
}
