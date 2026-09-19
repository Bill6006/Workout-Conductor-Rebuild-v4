import { describe, expect, it } from 'vitest';
import {
  PROGRAM_STYLES,
  TRAINING_STYLES,
  UserProfileSchema,
  createDefaultProfile,
  legacyStyleFor,
  styleChoice,
  withStyleChoice,
  type StyleId,
  type UserProfile,
} from '../../core/validation/profile';
import type { StallDiagnosis } from '../strategy/plateau';
import { adviseStyle, isAutoStyle, resolveStyle, undulatingCase } from './styleAdvice';
import { SOURCES, STYLES, STYLE_ORDER, evidenceLines } from './styles';

const NOW = '2026-09-18T12:00:00.000Z';
const base = createDefaultProfile(NOW);

function profileWith(patch: Partial<UserProfile>): UserProfile {
  return { ...base, ...patch };
}

function stall(exerciseId: string, kind: StallDiagnosis['kind'] = 'stalled-at-effort') {
  return {
    exerciseId,
    kind,
    exposures: 4,
    totalExposures: 5,
    baselineE1rm: 200,
    latestE1rm: 200,
    effortMet: 4,
    effortUnknown: 0,
    firstDate: NOW,
    lastDate: NOW,
    why: ['No better estimated max in four exposures.'],
  } satisfies StallDiagnosis;
}

describe('the style catalog', () => {
  it('describes every concrete style, each with sourced research', () => {
    const concrete = PROGRAM_STYLES.filter((style): style is StyleId => style !== 'auto');
    expect([...STYLE_ORDER].sort()).toEqual([...concrete].sort());
    for (const id of concrete) {
      const info = STYLES[id];
      expect(info.id).toBe(id);
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.line.length).toBeLessThanOrEqual(60);
      const sourced = info.evidence.filter((item) => item.sources.length > 0);
      expect(sourced.length).toBeGreaterThanOrEqual(2);
      for (const item of info.evidence) {
        for (const source of item.sources) expect(SOURCES[source]).toMatch(/(19|20)\d\d/);
      }
    }
  });

  it('writes a claim with its sources on one line', () => {
    const lines = evidenceLines('lean-down');
    expect(lines[0]).toContain('Murphy and Koehler, 2022');
    expect(lines.every((line) => line.length > 20)).toBe(true);
  });

  it('says so where the research pulls both ways', () => {
    expect(STYLES.undulating.grade).toBe('mixed');
    expect(evidenceLines('undulating').join(' ')).toContain('2026 ACSM position stand');
  });
});

describe('adviseStyle', () => {
  it('sends size-only goals to volume at moderate loads, and says what would change it', () => {
    const advice = adviseStyle(
      profileWith({ goals: { primary: 'build-muscle', secondary: 'bigger-arms' } }),
    );
    expect(advice.style).toBe('hypertrophy-focus');
    expect(advice.reasons[0]).toContain('weekly sets');
    expect(advice.hint).toContain('Strength progress');
  });

  it('sends strength with a size goal to the hybrid, in either order', () => {
    expect(
      adviseStyle(profileWith({ goals: { primary: 'strength', secondary: 'overall-size' } })).style,
    ).toBe('hybrid');
    expect(
      adviseStyle(profileWith({ goals: { primary: 'bigger-chest', secondary: 'strength' } })).style,
    ).toBe('hybrid');
  });

  it('sends strength alone to the strength focus', () => {
    expect(
      adviseStyle(profileWith({ goals: { primary: 'strength', secondary: 'none' } })).style,
    ).toBe('strength-focus');
  });

  it('puts losing fat ahead of the goals, and a beginner ahead of both', () => {
    const losing = profileWith({
      goals: { primary: 'strength', secondary: 'none', bodyweight: 'lose' },
    });
    expect(adviseStyle(losing).style).toBe('lean-down');
    expect(adviseStyle(losing).reasons[0]).toContain('losing fat');

    const newLifter = { ...losing, experience: 'beginner' as const };
    const advice = adviseStyle(newLifter);
    expect(advice.style).toBe('foundation');
    expect(advice.reasons.join(' ')).toContain('Losing fat does not change that');
  });

  it('treats holding and gaining as no change', () => {
    for (const bodyweight of ['hold', 'gain'] as const) {
      expect(
        adviseStyle(profileWith({ goals: { primary: 'strength', secondary: 'none', bodyweight } }))
          .style,
      ).toBe('strength-focus');
    }
  });

  it('names sources that exist for every answer', () => {
    const cases: UserProfile[] = [
      profileWith({ experience: 'beginner' }),
      profileWith({ goals: { primary: 'strength', secondary: 'none', bodyweight: 'lose' } }),
      profileWith({ goals: { primary: 'strength', secondary: 'none' } }),
      profileWith({ goals: { primary: 'strength', secondary: 'bigger-arms' } }),
      base,
    ];
    for (const profile of cases) {
      const advice = adviseStyle(profile);
      expect(advice.sources.length).toBeGreaterThan(0);
      for (const source of advice.sources) expect(SOURCES[source]).toBeDefined();
    }
  });
});

describe('resolveStyle', () => {
  it('follows the pick, and under Auto follows the goals', () => {
    expect(resolveStyle(profileWith({ programStyle: 'undulating' }))).toBe('undulating');
    const auto = profileWith({
      programStyle: 'auto',
      goals: { primary: 'strength', secondary: 'none' },
    });
    expect(isAutoStyle(auto)).toBe(true);
    expect(resolveStyle(auto)).toBe('strength-focus');
    expect(resolveStyle({ ...auto, goals: { ...auto.goals, bodyweight: 'lose' } })).toBe(
      'lean-down',
    );
  });

  it('reads a profile from before the newer field by its original one', () => {
    const legacy = profileWith({ programStyle: undefined, trainingStyle: 'strength-focus' });
    expect(styleChoice(legacy)).toBe('strength-focus');
    expect(resolveStyle(legacy)).toBe('strength-focus');
    expect(isAutoStyle(legacy)).toBe(false);
  });
});

describe('the profile fields', () => {
  it('keeps trainingStyle on a value a copy of the app from before the newer styles can read', () => {
    for (const style of STYLE_ORDER) {
      expect(TRAINING_STYLES).toContain(legacyStyleFor(style));
      const written = withStyleChoice(base, style, style);
      expect(written.programStyle).toBe(style);
      expect(TRAINING_STYLES).toContain(written.trainingStyle);
      expect(UserProfileSchema.safeParse(written).success).toBe(true);
    }
    const auto = withStyleChoice(base, 'auto', 'lean-down');
    expect(auto.programStyle).toBe('auto');
    expect(auto.trainingStyle).toBe('hybrid');
  });

  it('reads a value from a newer copy of the app as unset instead of failing the profile', () => {
    const future = {
      ...base,
      programStyle: 'something-newer',
      goals: { ...base.goals, bodyweight: 'recomp' },
    };
    const parsed = UserProfileSchema.safeParse(future);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.programStyle).toBeUndefined();
      expect(parsed.data.goals.bodyweight).toBeUndefined();
      expect(parsed.data.trainingStyle).toBe('hybrid');
    }
  });

  it('accepts a profile from before either field existed', () => {
    const legacy: Record<string, unknown> = { ...base };
    delete legacy.programStyle;
    expect(UserProfileSchema.safeParse(legacy).success).toBe(true);
  });
});

describe('undulatingCase', () => {
  const stalls = [stall('barbell-bench-press'), stall('back-squat')];

  it('needs two lifts stuck at the prescribed effort under a fixed-range style', () => {
    expect(undulatingCase(profileWith({ programStyle: 'hybrid' }), stalls)).toHaveLength(2);
    expect(undulatingCase(profileWith({ programStyle: 'hybrid' }), stalls.slice(0, 1))).toEqual([]);
    expect(
      undulatingCase(profileWith({ programStyle: 'hybrid' }), [
        stalls[0] as StallDiagnosis,
        stall('back-squat', 'undershooting'),
      ]),
    ).toEqual([]);
  });

  it('stays quiet for a beginner, and under a style that already varies or is not about strength', () => {
    expect(
      undulatingCase(profileWith({ programStyle: 'hybrid', experience: 'beginner' }), stalls),
    ).toEqual([]);
    expect(undulatingCase(profileWith({ programStyle: 'undulating' }), stalls)).toEqual([]);
    expect(undulatingCase(profileWith({ programStyle: 'hypertrophy-focus' }), stalls)).toEqual([]);
    expect(undulatingCase(profileWith({ programStyle: 'lean-down' }), stalls)).toEqual([]);
  });
});
