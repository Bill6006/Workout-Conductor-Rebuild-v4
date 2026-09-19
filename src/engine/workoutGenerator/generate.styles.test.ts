import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type ProgramStyle } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import { lightRange } from '../progression/roles';
import { allEntries, workingSets } from '../workout/types';
import { generateWorkout } from './generate';

const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.kind === 'gym',
);
if (!gym) throw new Error('expected a default gym');

const base = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };

function plan(
  programStyle: ProgramStyle,
  history: ReturnType<typeof record>[] = [],
  patch: Partial<typeof base> = {},
  templateId?: string,
) {
  return generateWorkout({
    profile: { ...base, ...patch, programStyle },
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: templateId ? { templateId } : undefined,
  });
}

describe('a workout generated under each style', () => {
  it('undulating: the main lift moves a zone on after each session, and its weight follows the reps', () => {
    const first = plan('undulating');
    const main = allEntries(first.blocks).find((entry) => entry.role === 'primary-strength');
    if (!main) throw new Error('expected a primary strength lift');
    const exercise = requireExercise(main.exerciseId);
    // Never logged: the heavy day.
    expect(workingSets(main)[0]?.targetReps).toEqual(exercise.repRanges.strength);

    // One heavy session in the log: today is the moderate day, lighter, from the estimated max.
    const heavy = record(
      3,
      exercise.id,
      [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ],
      exercise.repRanges.strength,
      2,
    );
    const second = plan('undulating', [heavy], {}, first.templateId);
    const again = allEntries(second.blocks).find((entry) => entry.exerciseId === exercise.id);
    if (!again) throw new Error('expected the same lift in the same template');
    const set = workingSets(again)[0];
    expect(set?.targetReps).toEqual(exercise.repRanges.hypertrophy);
    expect(again.progression?.mode).toBe('estimate');
    expect(set?.targetWeight).toBeLessThan(185);
    expect(again.progression?.evidence.join(' ')).toContain('The weight follows the reps');

    // Under Hybrid the same log keeps the fives and adds load, exactly as before.
    const hybrid = plan('hybrid', [heavy], {}, first.templateId);
    const same = allEntries(hybrid.blocks).find((entry) => entry.exerciseId === exercise.id);
    expect(workingSets(same!)[0]?.targetReps).toEqual(exercise.repRanges.strength);
    expect(workingSets(same!)[0]?.targetWeight).toBe(190);
  });

  it('light weights: every loaded lift sits at the light end', () => {
    for (const entry of allEntries(plan('high-rep').blocks)) {
      const exercise = requireExercise(entry.exerciseId);
      if (entry.role === 'corrective' || entry.role === 'warm-up') continue;
      expect(workingSets(entry).find((set) => set.kind === 'working')?.targetReps).toEqual(
        lightRange(exercise),
      );
    }
  });

  it('lean-down and foundation plan nothing to failure, drop sets included', () => {
    for (const style of ['lean-down', 'foundation'] as const) {
      const workout = plan(style);
      for (const entry of allEntries(workout.blocks)) {
        expect(entry.dropSet).toBe(false);
        for (const set of workingSets(entry)) expect(set.targetRir).toBeGreaterThanOrEqual(1);
      }
    }
    // The same profile under Hybrid does plan its one drop set.
    expect(allEntries(plan('hybrid').blocks).some((entry) => entry.dropSet)).toBe(true);
  });

  it('foundation trains the whole body or halves of it, never a four-way split', () => {
    const workout = plan('foundation', [], {
      schedule: { ...base.schedule, weeklyFrequency: 5 },
    });
    expect(['full-body', 'upper', 'lower']).toContain(workout.templateId);
  });

  it('says which style the session was written under, and when the goals picked it', () => {
    const picked = plan('auto', [], { goals: { primary: 'strength', secondary: 'none' } });
    expect(picked.explanation.reasons.join(' ')).toContain(
      'heavier loads, lower reps, longer rests (Strength focus, picked from your goals)',
    );
    const byHand = plan('strength-focus');
    expect(byHand.explanation.reasons.join(' ')).toContain(
      'heavier loads, lower reps, longer rests.',
    );
    expect(byHand.explanation.reasons.join(' ')).not.toContain('picked from your goals');
  });
});
