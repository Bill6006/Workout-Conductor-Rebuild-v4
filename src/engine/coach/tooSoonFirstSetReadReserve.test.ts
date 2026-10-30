import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { TOO_SOON_SOURCE, gatherSignals, type CoachInput } from './coachConductor';
import { withReadReserve } from '../progression/reserveCheck';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { CompletedWork } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * The second adversarial review of Maintenance 33: "too soon" reads today's first set as logged
 * against rested sessions read through the reserve check's estimate, so a dip within the noise
 * reads past the 8% line.
 *
 * Steps: a lifter with the reserve check on and a usable estimate: they leave a rep more than they
 * judge on machine and cable lifts (correction +1). Three rested sessions of the triceps pushdown:
 * 10 reps at 50 lb, logged "1 in reserve" (8-12 asked at 1). Skull crushers 30 h ago put the triceps
 * in a 36 h window (past three quarters of it, so the plan alone raises nothing). Today the
 * pushdown's first set: 7 reps at 50 lb, logged "1 in reserve", as asked of it.
 *
 * The rule: the first set against the rested sessions, "each read against what it asked", acts only
 * at "8% or more" (the report; proposal part 2: "One session is noisy (about ±4%), so a single day
 * acts only on a drop of 8% or more"); every reader reads the log "as the rules read it" (the first
 * review's fix: the hard start "reads the history as the rules read it", and `readStartOf` reads
 * today's sets through the same estimate: "A check set's measured reserve, whatever the estimate;
 * the error only where one is in force").
 *
 * What happens: the rested sessions come from the read log (`readHistory`: 1 judged reads as 2), but
 * `tooSoonSignals` reads today's set as logged (1), so the same lift at the same ask reads 9.5%
 * under (63.3 against 70), and the coach says "Your first Cable Triceps Pushdown set read 10% under
 * your rested sessions" and that the triceps may not have recovered. Read as the rules read it (2 in
 * reserve), the set is 7.1% under: no card.
 *
 * Synthetic data only.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;
// Its band spans today's set (7 reps and 1 in reserve, 8 in all) as it spans the rested ones (11):
// the rules read both through it.
const ESTIMATE = { correction: 1, band: [8, 14] as [number, number] };

const pushdowns = (daysAgo: number): WorkoutRecord => {
  const done = record(
    daysAgo,
    'cable-triceps-pushdown',
    [
      [10, 50, 1],
      [10, 50, 1],
      [10, 50, 1],
    ],
    [8, 12],
    1,
  );
  return {
    ...done,
    entries: done.entries.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set) => ({ ...set, targetWeight: 50 })),
    })),
  };
};

const raw: WorkoutRecord[] = [
  pushdowns(14),
  pushdowns(10),
  pushdowns(6),
  record(
    30 / 24,
    'skull-crusher',
    [
      [10, 50, 1],
      [10, 50, 1],
      [10, 50, 1],
      [10, 50, 1],
    ],
    [8, 12],
    1,
  ),
];

describe('"too soon" from a first set read through the reserve estimate', () => {
  it('reads today’s set as it reads the rested ones', () => {
    // The log as the store gives the rules: the estimate's rep added to each judged reserve.
    const history = withReadReserve(raw, ESTIMATE);
    expect(history[0]!.entries[0]!.sets[0]!.rir).toBe(2);

    const plan = generateWorkout({
      profile,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const workout = structuredClone(plan);
    const lead = allEntries(workout.blocks)[0]!;
    lead.exerciseId = 'cable-triceps-pushdown';
    for (const set of lead.sets) {
      if (set.kind !== 'working') continue;
      set.targetWeight = 50;
      set.targetReps = [8, 12];
      set.targetRir = 1;
    }
    const first = lead.sets.find((set) => set.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      currentEntryId: lead.id,
      sets: [
        {
          entryId: lead.id,
          exerciseId: lead.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 7,
          weight: 50,
          rir: 1,
          completedAt: RECORD_NOW,
        },
      ],
    };
    const input: CoachInput = {
      workout,
      status: 'active',
      duration: 'default',
      completed,
      constraints: emptyConstraints(),
      profile,
      history,
      now: RECORD_NOW,
      fatigue: interpretFatigue(history, RECORD_NOW),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: history.length,
    };
    const triceps = (from: CoachInput) =>
      gatherSignals(from).find((signal) => signal.source.startsWith(`${TOO_SOON_SOURCE}|triceps|`));
    // The estimate the log is read through, as the coach is given it (`useCoach`).
    expect(triceps({ ...input, reserveEstimate: ESTIMATE })?.why ?? []).toEqual([]);
    // Read as logged, the same set reads 10% under: the card the review found.
    expect(triceps(input)?.why.join(' ')).toContain('read 10% under your rested sessions');
  });
});
