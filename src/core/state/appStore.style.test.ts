import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { allEntries, workingSets, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { TRAINING_STYLES, createDefaultProfile, type UserProfile } from '../validation/profile';
import { alignLegacyStyle, profileTrigger } from './appStore';

const BENCH = 'barbell-bench-press';

async function seeded(profile: UserProfile = createDefaultProfile(TEST_NOW)) {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    profile,
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

function entries(handle: ReturnType<typeof createTestStore>): WorkoutEntry[] {
  return allEntries(handle.store.getSnapshot().session!.workout.blocks);
}

function benchOf(handle: ReturnType<typeof createTestStore>): WorkoutEntry {
  const entry = entries(handle).find((candidate) => candidate.exerciseId === BENCH);
  if (!entry) throw new Error('the default session has no bench press');
  return entry;
}

describe('the programming style in the store', () => {
  it('rebuilds the plan under the new style, saves it, and keeps it across a reload', async () => {
    const handle = await seeded();
    const bench = requireExercise(BENCH);
    expect(workingSets(benchOf(handle))[0]?.targetReps).toEqual(bench.repRanges.strength);

    await handle.store.setProgramStyle('high-rep');
    const state = handle.store.getSnapshot();
    expect(state.profile?.programStyle).toBe('high-rep');
    // The original field stays on something a copy of the app from before this can read.
    expect(state.profile?.trainingStyle).toBe('hypertrophy-focus');
    const top = bench.repRanges.hypertrophy[1];
    expect(workingSets(benchOf(handle))[0]?.targetReps).toEqual([top, top + 5]);
    expect(state.session?.lastSummary).not.toBeNull();

    const db = await handle.store.getDatabase();
    const stored = await db.get<UserProfile>('profile', 'current');
    expect(stored?.programStyle).toBe('high-rep');
    expect(TRAINING_STYLES).toContain(stored?.trainingStyle);
  });

  it('under Auto, follows the goals: losing fat changes how the sets are done', async () => {
    const handle = await seeded({
      ...createDefaultProfile(TEST_NOW),
      programStyle: 'auto',
      goals: { primary: 'strength', secondary: 'bigger-arms' },
    });
    const profile = handle.store.getSnapshot().profile!;
    expect(profile.trainingStyle).toBe('hybrid');
    const explanation = () =>
      handle.store.getSnapshot().session!.workout.explanation.reasons.join(' ');
    expect(explanation()).toContain('(Hybrid, picked from your goals)');

    await handle.store.saveProfile({
      ...profile,
      goals: { ...profile.goals, bodyweight: 'lose' },
    });
    expect(explanation()).toContain('(Lean-down, picked from your goals)');
    // Nothing in the session is taken to failure any more.
    for (const entry of entries(handle)) {
      for (const set of workingSets(entry)) expect(set.targetRir).toBeGreaterThanOrEqual(1);
    }
  });

  it('rebuilds the plan for a style change, and for Losing fat only when it changes the style', () => {
    const base = createDefaultProfile(TEST_NOW);
    const losing = (profile: UserProfile): UserProfile => ({
      ...profile,
      goals: { ...profile.goals, bodyweight: 'lose' },
    });
    expect(profileTrigger(base, { ...base, programStyle: 'undulating' })).toEqual({
      type: 'profile',
    });
    // Under Auto the switch moves the style, so the plan is rebuilt.
    const auto: UserProfile = { ...base, programStyle: 'auto' };
    expect(profileTrigger(auto, losing(auto))).toEqual({ type: 'profile' });
    // Under a style picked by hand it changes nothing the plan is built from.
    expect(profileTrigger(base, losing(base))).toBeNull();
    // Switching to Auto rebuilds once even when it comes to the same style, so the
    // explanation can say the goals picked it.
    const hybridGoals: UserProfile = {
      ...base,
      goals: { primary: 'strength', secondary: 'bigger-arms' },
    };
    expect(profileTrigger(hybridGoals, { ...hybridGoals, programStyle: 'auto' })).toEqual({
      type: 'profile',
    });
    expect(profileTrigger(base, { ...base })).toBeNull();
  });

  it('leaves a profile from before the newer field exactly as it was', () => {
    const legacy: UserProfile = {
      ...createDefaultProfile(TEST_NOW),
      trainingStyle: 'strength-focus',
    };
    delete legacy.programStyle;
    expect(alignLegacyStyle(legacy)).toBe(legacy);
    const auto: UserProfile = {
      ...legacy,
      programStyle: 'auto',
      goals: { primary: 'build-muscle', secondary: 'none' },
    };
    expect(alignLegacyStyle(auto).trainingStyle).toBe('hypertrophy-focus');
  });
});
