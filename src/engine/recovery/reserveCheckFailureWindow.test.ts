import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { withReadReserve } from '../progression/reserveCheck';
import { recoveryWindows } from './recovery';

/**
 * The second adversarial review of Maintenance 33: a reserve check's set taken to failure (item 43)
 * sets the muscle's window as if it had stopped short of failure.
 *
 * Steps: the lifter's triceps pushdown, three sets of 10 at 1 in reserve (8-12 asked at 1); the
 * last is the day's reserve check: at the usual stop (10 reps, "1 in reserve") they go on to
 * momentary failure, 12 reps in all, as the check asks. Nothing else works the triceps.
 *
 * The rule: the windows key on how close the sets went to failure (the report's table: "To failure,
 * or a long set a rep short", 48 h upper body; recovery-time-course.md, "Prior R per muscle, from its
 * hardest prime-mover sets": "0 RIR", 48 h upper); reserve-check.md on what a set to failure costs:
 * "more fatigue, muscle damage and discomfort, recovered within 24 to 48 hours"; the windows read
 * the log "as the rules read it" (the read history), and the report counts the check's set as a
 * working set ("A drop set is not read as hard work ...: a muscle's window and 'too soon' read its
 * working sets").
 *
 * What happens: the check set is read at its stop: 10 reps, its reserve the measured 2 (the read
 * history, `measuredReserve`) or the judged 1 (as logged), never the failure it was taken to, so the
 * triceps' window is 36 h ("sets one rep short of failure"), as for a session with no set to failure,
 * on the Plan screen, the completion, the hard start and "too soon" alike.
 *
 * Synthetic data only.
 */

const DONE = '2026-09-07T12:00:00.000Z';

const pushdowns: WorkoutRecord = {
  id: 'pushdowns',
  startedAt: DONE,
  completedAt: DONE,
  locationId: 'gym',
  templateId: 'pull-arms',
  endedEarly: false,
  rating: null,
  skippedExerciseIds: [],
  painJoints: [],
  readiness: null,
  prs: [],
  entries: [
    {
      exerciseId: 'cable-triceps-pushdown',
      plannedSets: 3,
      sets: [0, 1, 2].map((setIndex) => ({
        kind: 'working' as const,
        reps: 10,
        weight: 50,
        rir: 1,
        completed: true,
        setIndex,
        targetReps: [8, 12] as [number, number],
        targetRir: 1,
        targetWeight: 50,
        // The last set is the reserve check: on to failure, 12 reps in all.
        ...(setIndex === 2 ? { reserveCheck: { total: 12 } } : {}),
      })),
    },
  ],
};

describe('a reserve check set taken to failure', () => {
  it('sets the triceps window a set to failure sets', () => {
    // The log as the rules read it, as the coach, the Plan screen and the completion read it.
    const read = withReadReserve([pushdowns], null);
    const window = recoveryWindows(read, { now: DONE }).get('triceps');
    expect(window?.hours).toBe(48);
    expect(window?.reasons[0]).toBe('a set to failure or near it: 48 h');
  });
});
