import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import type { StallDiagnosis } from '../strategy/plateau';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  STYLE_GOALS_SOURCE,
  STYLE_UNDULATING_SOURCE,
  conductCoach,
  gatherSignals,
  type CoachInput,
} from './coachConductor';

const NOW = '2026-09-18T20:00:00.000Z';
const gym = createDefaultLocations({ gymAccess: true }, NOW).find((place) => place.kind === 'gym');
if (!gym) throw new Error('expected a default gym');

/** A profile from before the newer style field existed: only `trainingStyle` is set. */
function legacy(patch: Partial<UserProfile> = {}): UserProfile {
  const profile: UserProfile = { ...createDefaultProfile(NOW), ...patch };
  delete profile.programStyle;
  return profile;
}

function input(
  profile: UserProfile,
  extra: Partial<CoachInput> = {},
  status: CoachInput['status'] = 'preview',
): CoachInput {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: [],
    now: NOW,
    duration: 'default',
  });
  return {
    workout,
    status,
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history: [],
    now: NOW,
    fatigue: interpretFatigue([], NOW, null),
    strategy: [],
    lastExportAt: NOW,
    workoutCount: 0,
    stalls: [],
    ...extra,
  };
}

function stall(exerciseId: string): StallDiagnosis {
  return {
    exerciseId,
    kind: 'stalled-at-effort',
    exposures: 4,
    totalExposures: 5,
    baselineE1rm: 200,
    latestE1rm: 200,
    effortMet: 4,
    effortUnknown: 0,
    firstDate: NOW,
    lastDate: NOW,
    why: ['No better estimated max in four exposures at the prescribed effort.'],
  };
}

const bySource = (coachInput: CoachInput, source: string) =>
  gatherSignals(coachInput).find((signal) => signal.source === source);

describe('the goals offer', () => {
  it('tells a profile from before Auto which style its goals point to, with the research', () => {
    // Size goals on Hybrid: the research says volume at moderate loads.
    const signal = bySource(input(legacy()), STYLE_GOALS_SOURCE);
    expect(signal?.headline).toBe('Your goals point to Hypertrophy focus, not Hybrid');
    expect(signal?.domain).toBe('progression');
    expect(signal?.action).toEqual({ kind: 'style', style: 'auto', label: 'Let my goals choose' });
    expect(signal?.why[0]).toContain('weekly sets');
    expect(signal?.why[1]).toBe(
      'More weekly sets meant more growth, set by set. (Schoenfeld 2017; ACSM 2026)',
    );
    expect(conductCoach(input(legacy()))?.signal.source).toBe(STYLE_GOALS_SOURCE);
  });

  it('is a quiet tip when the goals point to the style already chosen', () => {
    const profile = legacy({ goals: { primary: 'strength', secondary: 'bigger-arms' } });
    const signal = bySource(input(profile), STYLE_GOALS_SOURCE);
    expect(signal?.headline).toBe('Your goals can pick the programming style');
    expect(signal?.domain).toBe('tips');
    expect(signal?.why[0]).toContain('Hybrid, the style you have now');
  });

  it('is never made to a profile that has the newer field, whatever it holds', () => {
    const made = createDefaultProfile(NOW);
    expect(bySource(input(made), STYLE_GOALS_SOURCE)).toBeUndefined();
    expect(bySource(input({ ...made, programStyle: 'auto' }), STYLE_GOALS_SOURCE)).toBeUndefined();
    expect(
      bySource(input({ ...made, programStyle: 'strength-focus' }), STYLE_GOALS_SOURCE),
    ).toBeUndefined();
  });

  it('waits until no workout is under way, because taking it rebuilds the plan', () => {
    for (const status of ['active', 'paused', 'completed'] as const) {
      expect(bySource(input(legacy(), {}, status), STYLE_GOALS_SOURCE)).toBeUndefined();
    }
  });

  it('stays away once declined', () => {
    const declines = {
      id: 'coach-declines' as const,
      declines: { [`${STYLE_GOALS_SOURCE}|*`]: { count: 1, lastAt: NOW } },
    };
    expect(conductCoach(input(legacy(), { declines }))?.signal.source).not.toBe(STYLE_GOALS_SOURCE);
  });
});

describe('the undulating offer', () => {
  const strength = { ...createDefaultProfile(NOW), programStyle: 'strength-focus' as const };
  const stalls = [stall('barbell-bench-press'), stall('back-squat')];

  it('names the stuck lifts, the research, and the limits of the research', () => {
    const signal = bySource(input(strength, { stalls }), STYLE_UNDULATING_SOURCE);
    expect(signal?.headline).toBe('2 lifts have stalled at a fixed rep range');
    expect(signal?.action).toEqual({
      kind: 'style',
      style: 'undulating',
      label: 'Rotate the rep ranges',
    });
    expect(signal?.why[0]).toContain('Barbell Bench Press');
    // The research and its limits both fit the two lines every experience level is shown.
    expect(signal?.why).toHaveLength(2);
    expect(signal?.why[1]).toContain('Moesgaard 2022');
    expect(signal?.why[1]).toContain('The evidence is mixed (ACSM 2026)');
    // It answers the whole stall, so it comes before the lift-by-lift routes.
    expect(conductCoach(input(strength, { stalls }))?.signal.source).toBe(STYLE_UNDULATING_SOURCE);
  });

  it('needs two stuck lifts', () => {
    expect(
      bySource(input(strength, { stalls: stalls.slice(0, 1) }), STYLE_UNDULATING_SOURCE),
    ).toBeUndefined();
  });
});

describe('losing fat', () => {
  it('never offers an extra set: more sets kept no more muscle in a deficit', () => {
    const profile = { ...createDefaultProfile(NOW), programStyle: 'hybrid' as const };
    const base = input(profile);
    const entry = allEntries(base.workout.blocks).find(
      (candidate) => candidate.role === 'isolation',
    );
    if (!entry) throw new Error('expected an isolation entry');
    entry.progression = {
      mode: 'reps',
      evidence: ['Two sessions at the top of the range: an extra set is on the table.'],
      sessions: 3,
      viaFamily: false,
      confidence: 'high',
      setsAdvice: 1,
    };
    expect(bySource(base, 'extra set')).toBeDefined();
    const lean = { ...base, profile: { ...profile, programStyle: 'lean-down' as const } };
    expect(bySource(lean, 'extra set')).toBeUndefined();
  });
});
