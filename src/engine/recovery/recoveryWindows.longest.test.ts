import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import { recoveryBalance } from '../planning/weeklyPlan';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from './fatigue';
import { hoursSince, recoveryWindows } from './recovery';
import { generateWorkout } from '../workoutGenerator/generate';
import { at } from '../../test/clockDays';

/**
 * Maintenance 33, the fresh review before shipping: the per-muscle windows (src/engine/recovery/recovery.ts) against
 * the approved table (docs/reports/maintenance-33.md, "Recovery judged per muscle";
 * docs/research/recovery-time-course.md: "Calves and lower-body isolation use the upper-body
 * values"). Times are on the device's own clock (`at`). Synthetic data only.
 */

type SetSpec = [reps: number, weight: number, rir: number];

function workout(
  when: string,
  parts: [exerciseId: string, sets: SetSpec[]][],
  range: [number, number] = [6, 12],
): WorkoutRecord {
  return {
    id: `w-${when}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: null,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: parts.map(([exerciseId, sets]) => ({
      exerciseId,
      plannedSets: sets.length,
      sets: sets.map(([reps, weight, rir], index) => ({
        kind: 'working' as const,
        reps,
        weight,
        rir,
        completed: true,
        setIndex: index,
        targetReps: range,
        targetRir: rir,
        targetWeight: weight,
      })),
    })),
  };
}

/** Five weeks of the same lifts, so none is new to the lifter. */
function weeksOf(parts: [exerciseId: string, sets: SetSpec[]][], lastDay: number): WorkoutRecord[] {
  return [35, 28, 21, 14, 7].map((back) => workout(at(lastDay - back, 9), parts));
}

describe('F2: a lower-body isolation set to failure takes the lower-body compound window', () => {
  // A common lower day (the plan's own roles: the squat at 2 in reserve, the leg extension, an
  // isolation lift, at 1 in reserve in sets of 12): the quads' hardest set is the leg extension's,
  // a long set a rep short, which the research reads with the upper-body values (48 h); the squat
  // at 2 in reserve is lower-body compound work 1-2 short (48 h). Neither set asks 72 h.
  const day = 28;
  const lower: [string, SetSpec[]][] = [
    [
      'back-squat',
      [
        [8, 100, 2],
        [8, 100, 2],
        [8, 100, 2],
      ],
    ],
    [
      'leg-extension',
      [
        [12, 50, 1],
        [12, 50, 1],
      ],
    ],
  ];
  const history = [...weeksOf(lower, day), workout(at(day, 18), lower)];

  it('baseline: each lift alone gives the table its own value', () => {
    const squatOnly = [...weeksOf([lower[0]!], day), workout(at(day, 18), [lower[0]!])];
    expect(recoveryWindows(squatOnly, { now: at(day + 1, 18) }).get('quads')?.hours).toBe(48);
    const extensionOnly = [...weeksOf([lower[1]!], day), workout(at(day, 18), [lower[1]!])];
    // Lower-body isolation to failure (a long set a rep short): the upper-body value.
    expect(recoveryWindows(extensionOnly, { now: at(day + 1, 18) }).get('quads')?.hours).toBe(48);
  });

  it('together they ask no more than the longer of the two (48 h)', () => {
    const quads = recoveryWindows(history, { now: at(day + 1, 18) }).get('quads');
    expect(
      quads?.hours,
      `quads: ${quads?.reasons.join('; ')} (squat 1-2 short = 48 h; leg extension to failure, isolation = 48 h)`,
    ).toBe(48);
  });

  it('the same for the hamstrings: Romanian deadlifts 2 short, then leg curls to failure', () => {
    // The RDL: lower-body compound 1-2 short, 48 h, and long lengths, 12 h more: 60 h. The leg curl,
    // isolation, a long set a rep short: the upper-body value, 48 h. The longer of the two is 60 h.
    const hinge: [string, SetSpec[]][] = [
      [
        'romanian-deadlift',
        [
          [8, 120, 2],
          [8, 120, 2],
          [8, 120, 2],
        ],
      ],
      [
        'leg-curl',
        [
          [12, 60, 1],
          [12, 60, 1],
        ],
      ],
    ];
    const hamstrings = recoveryWindows([...weeksOf(hinge, day), workout(at(day, 18), hinge)], {
      now: at(day + 1, 18),
    }).get('hamstrings');
    expect(hamstrings?.hours, `hamstrings: ${hamstrings?.reasons.join('; ')}`).toBe(60);
  });
});

describe('F3: a lighter session after a hard one ends the muscle window early', () => {
  // The chest worked hard on day 7 (four bench sets at 2 in reserve, three dumbbell fly sets of 12
  // a rep short: failure, seven hard sets, long lengths: 84 h); the next day the "too soon" card
  // offered "Lighter", taken: the bench at 3 in reserve, a set fewer, the fly at 2 in reserve.
  // That lighter day sets a 48 h window of its own, which replaces the 84 h one still running.
  const start = 14;
  const heavy: [string, SetSpec[]][] = [
    [
      'barbell-bench-press',
      [
        [8, 100, 2],
        [8, 100, 2],
        [8, 100, 2],
        [8, 100, 2],
      ],
    ],
    [
      'dumbbell-fly',
      [
        [12, 30, 1],
        [12, 30, 1],
        [12, 30, 1],
      ],
    ],
  ];
  const lighter: [string, SetSpec[]][] = [
    [
      'barbell-bench-press',
      [
        [7, 100, 3],
        [7, 100, 3],
        [7, 100, 3],
      ],
    ],
    [
      'dumbbell-fly',
      [
        [11, 30, 2],
        [11, 30, 2],
      ],
    ],
  ];
  const hardDay = workout(at(start, 8), heavy);
  const lighterDay = workout(at(start + 1, 8), lighter);
  const before = weeksOf(heavy, start);
  // Two and a half days after the hard session, a day later than the lighter one.
  const now = at(start + 2, 20);
  const profile = { ...createDefaultProfile(at(1)), bodyweight: 185 };
  const [, gym] = createDefaultLocations({ gymAccess: true }, at(1));

  function tooSoonChest(history: WorkoutRecord[]): boolean {
    const plan = generateWorkout({
      profile,
      location: gym,
      history,
      now,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const coach: CoachInput = {
      workout: plan,
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile,
      history,
      now,
      fatigue: interpretFatigue(history, now),
      strategy: [],
      lastExportAt: now,
      workoutCount: history.length,
    };
    return gatherSignals(coach).some((signal) => signal.source.startsWith('too-soon|chest|'));
  }

  it('baseline: after the hard day alone the chest is 60 h into 84 h, and "too soon" warns', () => {
    const chest = recoveryWindows([...before, hardDay], { now }).get('chest')!;
    expect(chest.hours).toBe(84);
    expect(hoursSince(chest, now)).toBe(60);
    expect(tooSoonChest([...before, hardDay])).toBe(true);
  });

  it('the lighter day does not shorten the recovery the hard day still needs', () => {
    const history = [...before, hardDay, lighterDay];
    const chest = recoveryWindows(history, { now }).get('chest')!;
    const endsAt = Date.parse(chest.at) + chest.hours * 3_600_000;
    const hardEndsAt = Date.parse(hardDay.completedAt!) + 84 * 3_600_000;
    expect(
      endsAt,
      `the chest's window now ends ${(hardEndsAt - endsAt) / 3_600_000} h before the hard day's 84 h do (${chest.reasons.join('; ')})`,
    ).toBeGreaterThanOrEqual(hardEndsAt);
  });

  it('nor does it take the "too soon" card away from a hard chest day still inside the 84 h', () => {
    expect(
      tooSoonChest([...before, hardDay, lighterDay]),
      'after the lighter day, a hard chest plan 60 h after the hard day is no longer flagged',
    ).toBe(true);
  });

  it('nor does the Plan screen say fewer hours left than the hard day alone leaves', () => {
    const left = (history: WorkoutRecord[]) =>
      recoveryBalance(history, now).find((row) => row.muscle === 'chest')?.hoursLeft ?? 0;
    expect(left([...before, hardDay])).toBe(24);
    expect(left([...before, hardDay, lighterDay])).toBeGreaterThanOrEqual(24);
  });
});
