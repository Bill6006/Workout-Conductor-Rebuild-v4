import { describe, expect, it } from 'vitest';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import {
  PROGRESSION_MODES,
  allEntries,
  type DurationChoice,
  type GeneratedWorkout,
} from '../../engine/workout/types';
import { RECORD_NOW, record } from '../../test/records';
import { createMemoryStorage, type KeyValueStorage } from '../storage/localSettings';
import { createDefaultLocations, type LocationProfile } from '../validation/location';
import { createDefaultProfile, type ProgramStyle, type UserProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import {
  SESSION_KEY,
  SESSION_RECOVERY_KEPT,
  SESSION_RECOVERY_KEY,
  createSession,
  readKeptSessions,
  readSession,
  readSessionOrKeep,
  writeSession,
  type WorkoutSession,
} from './session';

const NOW = RECORD_NOW;
const DAY = 86_400_000;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const gym = places.find((place) => place.kind === 'gym') as LocationProfile;
const home = places.find((place) => place.kind === 'home') as LocationProfile;
const base: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };

function daysAgo(days: number, item: WorkoutRecord, id: string): WorkoutRecord {
  const when = new Date(Date.parse(NOW) - days * DAY).toISOString();
  return { ...item, id, startedAt: when, completedAt: when };
}

function build(options: {
  duration?: DurationChoice;
  place?: LocationProfile;
  style?: ProgramStyle;
  history?: WorkoutRecord[];
  templateId?: string;
}): GeneratedWorkout {
  const place = options.place ?? gym;
  return generateWorkout({
    profile: { ...base, programStyle: options.style ?? 'hybrid', currentLocationId: place.id },
    location: place,
    history: options.history ?? [],
    now: NOW,
    duration: options.duration ?? 'default',
    constraints: options.templateId ? { templateId: options.templateId } : undefined,
  });
}

/** A session part way through: started, with its first working set logged. */
function inProgress(workout: GeneratedWorkout): WorkoutSession {
  const session = createSession('key', workout, NOW);
  const entry = allEntries(workout.blocks)[0];
  const set = entry?.sets.find((candidate) => candidate.kind === 'working');
  if (!entry || !set) throw new Error('expected a working set');
  return {
    ...session,
    status: 'active',
    activeSince: NOW,
    completed: {
      ...session.completed,
      startedAt: NOW,
      currentEntryId: entry.id,
      sets: [
        {
          entryId: entry.id,
          exerciseId: entry.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: set.targetReps[0],
          weight: set.targetWeight,
          rir: set.targetRir,
          skipped: false,
          completedAt: NOW,
        },
      ],
    },
  };
}

function reopen(session: WorkoutSession): {
  storage: KeyValueStorage;
  read: WorkoutSession | null;
} {
  const storage = createMemoryStorage();
  writeSession(session, storage);
  return { storage, read: readSession(storage) };
}

const bench = record(0, 'barbell-bench-press', [
  [10, 135, 2],
  [10, 135, 2],
]);
const benchAtEights = {
  ...bench,
  entries: bench.entries.map((entry) => ({
    ...entry,
    sets: entry.sets.map((set) => ({ ...set, targetReps: [8, 12] as [number, number] })),
  })),
};

describe('a workout in progress survives the app reopening', () => {
  it('whatever way its targets were worked out', () => {
    for (const mode of PROGRESSION_MODES) {
      const session = inProgress(build({}));
      const entry = allEntries(session.workout.blocks)[0];
      if (!entry?.progression) throw new Error('expected a progression note');
      entry.progression = { ...entry.progression, mode };
      const { read } = reopen(session);
      expect(read, `mode ${mode}`).toEqual(session);
    }
  });

  it('keeps every kind of workout the app builds, exactly as it was', () => {
    const scenarios: [string, GeneratedWorkout][] = [
      ['Default at the gym', build({})],
      ['15 min at home', build({ duration: 15, place: home })],
      ['30 min at the gym', build({ duration: 30 })],
      ['45 min at home, light weights', build({ duration: 45, place: home, style: 'high-rep' })],
      ['Default, lean-down', build({ style: 'lean-down' })],
      ['Default, foundation', build({ style: 'foundation' })],
      [
        'Undulating after a heavy day',
        build({ style: 'undulating', history: [daysAgo(3, bench, 'w-heavy')] }),
      ],
      ['Back after a month off', build({ history: [daysAgo(30, bench, 'w-month')] })],
      [
        'Bench at a new rep range',
        build({ history: [daysAgo(3, benchAtEights, 'w-eights')], templateId: 'push-arms' }),
      ],
    ];
    const modes = new Set<string>();
    for (const [name, workout] of scenarios) {
      for (const entry of allEntries(workout.blocks)) modes.add(entry.progression?.mode ?? '');
      const session = inProgress(workout);
      expect(reopen(session).read, name).toEqual(session);
    }
    // The two ways of working out a target the old reader did not know are both covered here.
    expect(modes).toContain('return');
    expect(modes).toContain('estimate');
  });

  it('drops a target note it cannot read instead of losing the workout', () => {
    const session = inProgress(build({}));
    const raw = JSON.parse(JSON.stringify(session)) as {
      workout: { blocks: { entries: { progression?: { mode: string } }[] }[] };
    };
    const first = raw.workout.blocks[0]?.entries[0];
    if (!first?.progression) throw new Error('expected a progression note');
    first.progression.mode = 'a-mode-from-a-newer-copy';
    const storage = createMemoryStorage();
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const read = readSession(storage);
    expect(read?.status).toBe('active');
    expect(read?.completed.sets).toHaveLength(1);
    expect(allEntries(read!.workout.blocks)[0]?.progression).toBeUndefined();
    expect(allEntries(read!.workout.blocks)[1]?.progression?.mode).toBeDefined();
  });
});

describe('a stored workout that cannot be read back is kept, never written over', () => {
  function unreadable(status: string, sets: number): string {
    const session = inProgress(build({}));
    const logged = Array.from({ length: sets }, (_, index) => ({
      ...session.completed.sets[0],
      setIndex: index,
    }));
    return JSON.stringify({
      ...session,
      status,
      completed: { ...session.completed, sets: logged },
      // A shape no copy of the app writes: the whole session fails to read.
      workout: { ...session.workout, blocks: 'not a list' },
    });
  }

  it('returns nothing to keep when nothing is stored, and the session itself when it reads', () => {
    const storage = createMemoryStorage();
    expect(readSessionOrKeep(storage, NOW)).toEqual({ session: null, kept: null });
    const session = inProgress(build({}));
    writeSession(session, storage);
    expect(readSessionOrKeep(storage, NOW)).toEqual({ session, kept: null });
    expect(storage.getItem(SESSION_RECOVERY_KEY)).toBeNull();
  });

  it('keeps an unreadable workout in progress, with how many sets it had logged', () => {
    const storage = createMemoryStorage();
    const raw = unreadable('active', 3);
    storage.setItem(SESSION_KEY, raw);
    const result = readSessionOrKeep(storage, NOW);
    expect(result.session).toBeNull();
    expect(result.kept).toEqual({ keptAt: NOW, status: 'active', setsLogged: 3, saved: true });
    const [kept] = readKeptSessions(storage);
    expect(kept?.session).toEqual(JSON.parse(raw));
    // The stored copy itself is left where it was; only the store's fresh session replaces it.
    expect(storage.getItem(SESSION_KEY)).toBe(raw);
  });

  it('keeps damaged text as it is, and lets a plain preview go', () => {
    const storage = createMemoryStorage();
    storage.setItem(SESSION_KEY, '{"status":"active","completed":{"sets":[');
    expect(readSessionOrKeep(storage, NOW).kept).toMatchObject({ status: null, setsLogged: null });
    expect(readKeptSessions(storage)[0]?.session).toBe('{"status":"active","completed":{"sets":[');

    const quiet = createMemoryStorage();
    quiet.setItem(SESSION_KEY, unreadable('preview', 0));
    expect(readSessionOrKeep(quiet, NOW)).toEqual({ session: null, kept: null });
    expect(quiet.getItem(SESSION_RECOVERY_KEY)).toBeNull();
  });

  it('keeps the newest few, newest first', () => {
    const storage = createMemoryStorage();
    for (let index = 0; index < SESSION_RECOVERY_KEPT + 2; index += 1) {
      storage.setItem(SESSION_KEY, unreadable('paused', index + 1));
      readSessionOrKeep(storage, new Date(Date.parse(NOW) + index * 60_000).toISOString());
    }
    const kept = readKeptSessions(storage);
    expect(kept).toHaveLength(SESSION_RECOVERY_KEPT);
    expect(kept.map((item) => item.setsLogged)).toEqual([5, 4, 3]);
  });
});
