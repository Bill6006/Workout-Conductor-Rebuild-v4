import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import { equipmentAvailable } from '../conflicts/conflictEngine';
import { buildConflictContext } from '../conflicts/context';
import { allEntries, type DurationChoice, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate, scopeFor } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  TriggerType,
} from './types';

const NOW = '2026-09-03T14:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const baseProfile = createDefaultProfile(NOW);

function build(
  profile: UserProfile = baseProfile,
  duration: DurationChoice = 'default',
  location = gym,
): GeneratedWorkout {
  return generateWorkout({ profile, location, history: [], now: NOW, duration });
}

function request(
  trigger: RecalibrationTrigger,
  overrides: Partial<RecalibrationRequest> = {},
): RecalibrationRequest {
  const workout = overrides.workout ?? build();
  return {
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: workout.duration.choice,
    profile: baseProfile,
    location: gym,
    history: [],
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
    ...overrides,
  };
}

function run(
  trigger: RecalibrationTrigger,
  overrides: Partial<RecalibrationRequest> = {},
): RecalibrationSuccess {
  const result = recalibrate(request(trigger, overrides));
  if (!result.ok) throw new Error(result.error);
  return result;
}

const names = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => requireExercise(entry.exerciseId).name);
const entry = (workout: GeneratedWorkout, id: string) => {
  const found = allEntries(workout.blocks).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};
const working = (workout: GeneratedWorkout, id: string) =>
  entry(workout, id).sets.filter((set) => set.kind === 'working');

/** Logs the first `count` sets of an entry (warm-ups first) and makes it the current exercise. */
function logSets(
  workout: GeneratedWorkout,
  entryId: string,
  count: number,
  elapsedMinutes = 0,
): CompletedWork {
  const target = entry(workout, entryId);
  const sets = target.sets
    .filter((set) => set.kind !== 'drop')
    .slice(0, count)
    .map((set) => ({
      entryId,
      exerciseId: target.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: 8,
      weight: 135,
      rir: 2,
      completedAt: NOW,
    }));
  return {
    startedAt: NOW,
    elapsedSeconds: elapsedMinutes * 60,
    currentEntryId: entryId,
    sets,
  };
}

function merge(...parts: CompletedWork[]): CompletedWork {
  const last = parts[parts.length - 1] as CompletedWork;
  return {
    startedAt: NOW,
    elapsedSeconds: last.elapsedSeconds,
    currentEntryId: last.currentEntryId,
    sets: parts.flatMap((part) => part.sets),
  };
}

describe('recalibration: duration', () => {
  it('Default to 15 min before the workout is a full rebuild with a compact summary', () => {
    const before = build();
    const result = run({ type: 'duration', choice: 15 }, { workout: before });
    expect(result.scope).toBe('full');
    expect(result.duration).toBe(15);
    expect(result.workout.duration.choice).toBe(15);
    expect(allEntries(result.workout.blocks).length).toBeLessThanOrEqual(4);
    expect(result.summary.headline).toMatch(/^Recalibrated to 15 min: .*exercises? removed/);
    expect(result.summary.counts.removed).toBeGreaterThanOrEqual(2);
    expect(result.workout.recalibration).toEqual({ version: 2, lastTrigger: 'duration' });
    expect(result.workout.id).toBe(before.id);
    // The engine is pure: the previous workout is untouched.
    expect(before).toEqual(build());
  });

  it('15 to 30, 30 to 45, and back to Default each explain what changed', () => {
    const fifteen = run({ type: 'duration', choice: 15 }).workout;
    const thirty = run({ type: 'duration', choice: 30 }, { workout: fifteen, duration: 15 });
    expect(thirty.summary.headline).toMatch(/^Recalibrated to 30 min: .*added/);
    expect(allEntries(thirty.workout.blocks).length).toBeGreaterThan(
      allEntries(fifteen.blocks).length,
    );
    const fortyFive = run(
      { type: 'duration', choice: 45 },
      { workout: thirty.workout, duration: 30 },
    );
    expect(fortyFive.summary.headline).toMatch(/^Recalibrated to 45 min/);
    const back = run(
      { type: 'duration', choice: 'default' },
      { workout: fortyFive.workout, duration: 45 },
    );
    expect(back.summary.headline).toMatch(/^Back to Default time: /);
    expect(names(back.workout)).toEqual(names(build()));
    // Every step bumps the version: 15, 30, 45, Default.
    expect(back.workout.recalibration.version).toBe(5);
  });

  it('after one logged set the main lift is frozen and only the future changes', () => {
    const before = build();
    const completed = logSets(before, 'e1', 3, 8);
    const result = run(
      { type: 'duration', choice: 30 },
      { workout: before, completed, currentEntryId: 'e1' },
    );
    expect(result.scope).toBe('partial');
    expect(entry(result.workout, 'e1')).toEqual(entry(before, 'e1'));
    expect(allEntries(result.workout.blocks)[0]?.id).toBe('e1');
    expect(result.workout.warmup.generalMinutes).toBe(0);
    expect(result.workout.duration.targetMinutes).toBe(22);
    expect(result.workout.duration.estimatedMinutes).toBeLessThanOrEqual(23);
    expect(allEntries(result.workout.blocks).length).toBeLessThan(allEntries(before.blocks).length);
    expect(result.summary.headline).toMatch(/^Recalibrated to 30 min with 8 min done: /);
  });

  it('halfway through, the remaining session fits the time left and keeps every logged row', () => {
    const before = build();
    const completed = merge(
      logSets(before, 'e1', entry(before, 'e1').sets.length, 0),
      logSets(before, 'e2', entry(before, 'e2').sets.length, 30),
    );
    const result = run(
      { type: 'duration', choice: 45 },
      { workout: before, completed, currentEntryId: 'e2' },
    );
    const ids = allEntries(result.workout.blocks).map((item) => item.id);
    expect(ids.slice(0, 2)).toEqual(['e1', 'e2']);
    expect(entry(result.workout, 'e1')).toEqual(entry(before, 'e1'));
    expect(entry(result.workout, 'e2')).toEqual(entry(before, 'e2'));
    expect(result.workout.duration.targetMinutes).toBe(15);
    expect(result.workout.duration.estimatedMinutes).toBeLessThanOrEqual(16);
    expect(result.workout.explanation.summary).toContain('fitted to the 15 min left');
  });
});

describe('recalibration: place and equipment', () => {
  it('switching the place replaces what Home cannot do', () => {
    const result = run({ type: 'location' }, { location: home });
    expect(result.scope).toBe('full');
    expect(names(result.workout)).not.toContain('Barbell Bench Press');
    expect(result.summary.headline).toMatch(/^Rebuilt for Home: .*replaced/);
    const available = new Set(home?.equipment ?? []);
    for (const item of allEntries(result.workout.blocks)) {
      expect(equipmentAvailable(requireExercise(item.exerciseId), available)).toBe(true);
    }
  });

  it('a busy station swaps only that row and stays busy for later rebuilds', () => {
    const before = build();
    const result = run({ type: 'equipment-busy', entryId: 'e1' }, { workout: before });
    expect(result.scope).toBe('local');
    expect(entry(result.workout, 'e1').exerciseId).not.toBe('barbell-bench-press');
    expect(entry(result.workout, 'e1').replacedFrom).toBe('barbell-bench-press');
    for (const item of allEntries(before.blocks).filter((candidate) => candidate.id !== 'e1')) {
      expect(entry(result.workout, item.id)).toEqual(item);
    }
    expect(result.constraints.busyEquipment.length).toBeGreaterThan(0);
    expect(result.summary.headline).toMatch(/busy: 1 exercise replaced\.$/);
    expect(result.summary.counts.replaced).toBe(1);

    const later = run(
      { type: 'duration', choice: 15 },
      { workout: result.workout, constraints: result.constraints },
    );
    const busy = new Set(result.constraints.busyEquipment);
    const available = new Set((gym?.equipment ?? []).filter((id) => !busy.has(id)));
    for (const item of allEntries(later.workout.blocks)) {
      expect(equipmentAvailable(requireExercise(item.exerciseId), available)).toBe(true);
    }
  });

  it('an edited equipment profile updates the session', () => {
    const smallerGym = {
      ...(gym as NonNullable<typeof gym>),
      equipment: (gym?.equipment ?? []).filter((id) => id !== 'barbell'),
    };
    const result = run({ type: 'equipment' }, { location: smallerGym });
    expect(result.summary.headline).toMatch(/^Updated for the equipment at Gym: /);
    expect(names(result.workout)).not.toContain('Barbell Bench Press');
  });
});

describe('recalibration: one exercise at a time', () => {
  it('selecting an alternative changes one exercise, locks it, and survives a shorter rebuild', () => {
    const before = build();
    const current = entry(before, 'e4');
    const alternative = rankAlternatives({
      current: requireExercise(current.exerciseId),
      context: buildConflictContext(baseProfile, gym),
      otherExercises: allEntries(before.blocks)
        .filter((item) => item.id !== 'e4')
        .map((item) => requireExercise(item.exerciseId)),
    }).candidates[0]?.exercise;
    expect(alternative).toBeDefined();
    const result = run(
      { type: 'replace', entryId: 'e4', exerciseId: alternative!.id },
      { workout: before },
    );
    expect(result.scope).toBe('local');
    const swapped = entry(result.workout, 'e4');
    expect(swapped.exerciseId).toBe(alternative!.id);
    expect(swapped.locked).toBe(true);
    expect(swapped.replacedFrom).toBe(current.exerciseId);
    expect(working(result.workout, 'e4').length).toBe(working(before, 'e4').length);
    for (const item of allEntries(before.blocks).filter((candidate) => candidate.id !== 'e4')) {
      expect(entry(result.workout, item.id)).toEqual(item);
    }
    expect(result.summary.headline).toBe(
      `Swapped ${requireExercise(current.exerciseId).name} for ${alternative!.name}.`,
    );
    expect(result.changes).toEqual([
      expect.objectContaining({ entryId: 'e4', kind: 'replaced', exerciseId: alternative!.id }),
    ]);

    const shorter = run({ type: 'duration', choice: 15 }, { workout: result.workout });
    expect(shorter.scope).toBe('partial');
    expect(entry(shorter.workout, 'e4').exerciseId).toBe(alternative!.id);
  });

  it('a replacement that would repeat an exercise fails and hands back the previous workout', () => {
    const before = build();
    const failed = recalibrate(
      request(
        { type: 'replace', entryId: 'e4', exerciseId: 'barbell-bench-press' },
        { workout: before },
      ),
    );
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.workout).toBe(before);
    expect(failed.error).toMatch(/nothing was changed/);
    const unknown = recalibrate(
      request(
        { type: 'replace', entryId: 'e4', exerciseId: 'not-an-exercise' },
        { workout: before },
      ),
    );
    expect(unknown.ok).toBe(false);
    expect(before).toEqual(build());
  });

  it('skipping removes the row, remembers it for the session, and saves time', () => {
    const before = build();
    const result = run({ type: 'skip', entryId: 'e4' }, { workout: before });
    expect(allEntries(result.workout.blocks).map((item) => item.id)).not.toContain('e4');
    expect(result.constraints.avoidExerciseIds).toEqual([entry(before, 'e4').exerciseId]);
    expect(result.summary.headline).toMatch(/^Skipped .+: about \d+ min saved\.$/);
    expect(result.workout.duration.estimatedMinutes).toBeLessThan(before.duration.estimatedMinutes);
    expect(result.workout.blocks.every((block) => block.entries.length > 0)).toBe(true);

    const rebuilt = run(
      { type: 'duration', choice: 'default' },
      { workout: result.workout, constraints: result.constraints },
    );
    expect(allEntries(rebuilt.workout.blocks).map((item) => item.exerciseId)).not.toContain(
      entry(before, 'e4').exerciseId,
    );
  });

  it('reporting shoulder pain protects the joint without touching the profile', () => {
    const before = build();
    const result = run({ type: 'pain', entryId: 'e3', joint: 'shoulder' }, { workout: before });
    expect(result.constraints.painJoints).toEqual(['shoulder']);
    expect(result.summary.headline).toMatch(/^Protecting your shoulder: /);
    const stillThere = allEntries(result.workout.blocks).find((item) => item.id === 'e3');
    if (stillThere) expect(stillThere.exerciseId).not.toBe(entry(before, 'e3').exerciseId);
    for (const item of allEntries(result.workout.blocks)) {
      expect(requireExercise(item.exerciseId).jointStress.shoulder).not.toBe('high');
    }
    expect(baseProfile.limitations.painAreas).toEqual([]);
  });

  it('marking an exercise uncomfortable swaps in the best alternative', () => {
    const before = build();
    const result = run({ type: 'uncomfortable', entryId: 'e5' }, { workout: before });
    expect(entry(result.workout, 'e5').exerciseId).not.toBe(entry(before, 'e5').exerciseId);
    expect(result.constraints.avoidExerciseIds).toEqual([entry(before, 'e5').exerciseId]);
    expect(result.summary.headline).toMatch(/replaced by .+ for comfort\.$/);
  });

  it('pinning keeps a row through a shorter rebuild', () => {
    const before = build();
    const pinned = run({ type: 'pin', entryId: 'e7', pinned: true }, { workout: before });
    expect(entry(pinned.workout, 'e7').pinned).toBe(true);
    expect(pinned.summary.headline).toMatch(/^Pinned .+: it stays through every recalibration\.$/);
    const shorter = run({ type: 'duration', choice: 15 }, { workout: pinned.workout });
    expect(shorter.scope).toBe('partial');
    expect(allEntries(shorter.workout.blocks).map((item) => item.id)).toContain('e7');
    const unpinned = run(
      { type: 'pin', entryId: 'e7', pinned: false },
      { workout: pinned.workout },
    );
    expect(entry(unpinned.workout, 'e7').pinned).toBe(false);
  });
});

describe('recalibration: techniques and effort', () => {
  it('disabling and enabling supersets re-pairs the session', () => {
    const off: UserProfile = {
      ...baseProfile,
      techniques: { ...baseProfile.techniques, supersets: false },
    };
    const withoutPairs = run({ type: 'technique', technique: 'supersets' }, { profile: off });
    expect(withoutPairs.workout.blocks.some((block) => block.kind === 'superset')).toBe(false);
    expect(withoutPairs.summary.headline).toMatch(/^Supersets off: .*superset.* removed/);

    const withPairs = run(
      { type: 'technique', technique: 'supersets' },
      { workout: withoutPairs.workout, profile: baseProfile },
    );
    expect(withPairs.workout.blocks.some((block) => block.kind === 'superset')).toBe(true);
    expect(withPairs.summary.headline).toMatch(/^Supersets on: .*superset.* added/);
  });

  it('disabling drop sets removes the drop set', () => {
    const off: UserProfile = {
      ...baseProfile,
      techniques: { ...baseProfile.techniques, dropSets: false },
    };
    const result = run({ type: 'technique', technique: 'dropSets' }, { profile: off });
    expect(allEntries(result.workout.blocks).some((item) => item.dropSet)).toBe(false);
    expect(result.summary.headline).toMatch(/^Drop sets off: /);
  });

  it('exceeding or missing the rep target adjusts only the next sets', () => {
    const before = build();
    const firstWorking = working(before, 'e1')[0]!;
    const [min, max] = firstWorking.targetReps;
    const completed = logSets(before, 'e1', 3);
    const more = run(
      { type: 'performance', entryId: 'e1', setIndex: firstWorking.index, actualReps: max + 3 },
      { workout: before, completed, currentEntryId: 'e1' },
    );
    const next = working(more.workout, 'e1');
    expect(next[0]?.targetReps).toEqual([min, max]);
    expect(next[1]?.targetReps).toEqual([min + 2, max + 2]);
    expect(more.summary.headline).toMatch(/add a little weight\.$/);

    const fewer = run(
      { type: 'performance', entryId: 'e1', setIndex: firstWorking.index, actualReps: min - 3 },
      { workout: before, completed, currentEntryId: 'e1' },
    );
    expect(working(fewer.workout, 'e1')[1]?.targetReps).toEqual([min - 2, max - 2]);

    const close = run(
      { type: 'performance', entryId: 'e1', setIndex: firstWorking.index, actualReps: max },
      { workout: before, completed, currentEntryId: 'e1' },
    );
    expect(close.workout.blocks).toEqual(before.blocks);
    expect(close.summary.headline).toMatch(/no change\.$/);
  });

  it('a target weight applies to the remaining working sets only', () => {
    const before = build();
    const result = run({ type: 'target-weight', entryId: 'e1', weight: 185 }, { workout: before });
    expect(working(result.workout, 'e1').every((set) => set.targetWeight === 185)).toBe(true);
    expect(entry(result.workout, 'e1').sets[0]?.targetWeight).toBeNull();
    expect(result.summary.headline).toBe('Target 185 lb for Barbell Bench Press.');
  });

  it('low readiness reduces volume and effort instead of cancelling', () => {
    const before = build();
    const tired = run(
      {
        type: 'readiness',
        readiness: {
          energy: 2,
          soreness: 3,
          sleep: 2,
          motivation: 3,
          jointDiscomfort: [],
          timePressure: false,
        },
      },
      { workout: before },
    );
    expect(tired.scope).toBe('partial');
    expect(allEntries(tired.workout.blocks).length).toBeGreaterThanOrEqual(4);
    expect(working(tired.workout, 'e1').length).toBe(working(before, 'e1').length - 1);
    expect(working(tired.workout, 'e1')[0]?.targetRir).toBe(
      (working(before, 'e1')[0]?.targetRir ?? 0) + 1,
    );
    expect(tired.summary.headline).toMatch(
      /^Adjusted for today \(fewer sets with an extra rep in reserve\): /,
    );

    const fresh = run(
      {
        type: 'readiness',
        readiness: {
          energy: 5,
          soreness: 1,
          sleep: 4,
          motivation: 5,
          jointDiscomfort: [],
          timePressure: false,
        },
      },
      { workout: before },
    );
    expect(fresh.summary.headline).toBe('Feeling good: full workout kept.');
    expect(fresh.workout.blocks).toEqual(before.blocks);

    const rushed = run(
      {
        type: 'readiness',
        readiness: {
          energy: 4,
          soreness: 1,
          sleep: 4,
          motivation: 4,
          jointDiscomfort: ['knee'],
          timePressure: true,
        },
      },
      { workout: before },
    );
    expect(rushed.duration).toBe(45);
    expect(rushed.constraints.painJoints).toEqual(['knee']);
    expect(rushed.summary.headline).toMatch(
      /easier on your knee, fitted to 45 min for time pressure/,
    );
  });

  it('harder and easier change the remaining sets and effort', () => {
    const before = build();
    const harder = run({ type: 'intensity', direction: 'harder' }, { workout: before });
    expect(harder.constraints.intensity).toBe(1);
    expect(working(harder.workout, 'e4').length).toBe(working(before, 'e4').length + 1);
    expect(working(harder.workout, 'e4')[0]?.targetRir).toBe(
      (working(before, 'e4')[0]?.targetRir ?? 1) - 1,
    );
    expect(harder.summary.headline).toMatch(/^Rest of the workout made harder: /);
    const easier = run(
      { type: 'intensity', direction: 'easier' },
      { workout: harder.workout, constraints: harder.constraints },
    );
    expect(easier.constraints.intensity).toBe(0);
  });
});

describe('recalibration: time and interruptions', () => {
  it('End by exact time fits strictly and can be switched off', () => {
    const before = build();
    const endBy = new Date(Date.parse(NOW) + 40 * 60_000).toISOString();
    const strict = run({ type: 'end-by', time: endBy }, { workout: before });
    expect(strict.constraints.endBy).toBe(endBy);
    expect(strict.workout.duration.targetMinutes).toBe(40);
    expect(strict.workout.duration.estimatedMinutes).toBeLessThanOrEqual(40);
    const clock = new Date(endBy).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(strict.summary.headline.startsWith(`Ends by ${clock}: `)).toBe(true);
    const relaxed = run(
      { type: 'end-by', time: null },
      { workout: strict.workout, constraints: strict.constraints },
    );
    expect(relaxed.constraints.endBy).toBeNull();
    expect(relaxed.workout.duration.targetMinutes).toBe(60);
    expect(relaxed.summary.headline).toMatch(/^Exact end time off: /);
  });

  it('resuming after a long break rebuilds the remaining time with a light warm-up', () => {
    const before = build();
    const completed = logSets(before, 'e1', 3, 20);
    const long = run(
      { type: 'resume', awaySeconds: 25 * 60 },
      { workout: before, completed, currentEntryId: 'e1' },
    );
    expect(long.workout.warmup.generalMinutes).toBe(1.5);
    expect(long.summary.headline).toMatch(/^Back after 25 min/);
    expect(long.summary.details).toContain('One light ramp set before you continue.');
    expect(entry(long.workout, 'e1')).toEqual(entry(before, 'e1'));

    const short = run(
      { type: 'resume', awaySeconds: 5 * 60 },
      { workout: before, completed, currentEntryId: 'e1' },
    );
    expect(short.workout.blocks).toEqual(before.blocks);
    expect(short.summary.headline).toBe('Back after 5 min: nothing to change.');
  });

  it('finishing early keeps only logged work and the current exercise', () => {
    const before = build();
    const completed = merge(
      logSets(before, 'e1', entry(before, 'e1').sets.length, 0),
      logSets(before, 'e2', 1, 25),
    );
    const result = run(
      { type: 'finish-early' },
      { workout: before, completed, currentEntryId: 'e2' },
    );
    expect(allEntries(result.workout.blocks).map((item) => item.id)).toEqual(['e1', 'e2']);
    expect(result.summary.headline).toMatch(/^Finishing early: \d+ exercises left out\.$/);
  });
});

describe('recalibration: scope and speed', () => {
  it('assigns local, partial, and full scopes from the trigger registry and the session state', () => {
    const before = build();
    const local: TriggerType[] = [
      'equipment-busy',
      'replace',
      'skip',
      'pain',
      'uncomfortable',
      'pin',
      'performance',
      'target-weight',
    ];
    for (const type of local) {
      expect(scopeFor(request({ type } as RecalibrationTrigger, { workout: before }))).toBe(
        'local',
      );
    }
    expect(scopeFor(request({ type: 'readiness' } as RecalibrationTrigger))).toBe('partial');
    expect(scopeFor(request({ type: 'duration', choice: 15 }))).toBe('full');
    expect(
      scopeFor(request({ type: 'duration', choice: 15 }, { completed: logSets(before, 'e1', 1) })),
    ).toBe('partial');
    expect(scopeFor(request({ type: 'location' }, { lockedEntryIds: ['e2'] }))).toBe('partial');
  });

  it('runs a local change in under 250 ms and a full rebuild in under 700 ms', () => {
    const before = build();
    const local = run({ type: 'skip', entryId: 'e4' }, { workout: before });
    const full = run({ type: 'duration', choice: 30 }, { workout: before });
    const partial = run(
      { type: 'duration', choice: 30 },
      { workout: before, completed: logSets(before, 'e1', 3, 8), currentEntryId: 'e1' },
    );
    expect(local.durationMs).toBeLessThan(250);
    expect(full.durationMs).toBeLessThan(700);
    expect(partial.durationMs).toBeLessThan(700);
  });
});
