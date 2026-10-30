import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { learnedWindows } from '../../engine/recovery/recovery';
import { LearnedValues } from './LearnedValues';
import { Providers, createTestStore } from '../../test/testStore';

/**
 * The third adversarial review of Maintenance 33: the learned page's "Your recovery" reads the log
 * as logged, while every window the app uses reads it as the rules read it, through the lifter's
 * reserve checks.
 *
 * Steps: a hybrid lifter who opted in to reserve checks. Four weekly cable curl sessions end in a
 * check: 10 reps judged 2 in reserve, 14 in all, an error of 2 reps, so every covered reserve is
 * read 2 higher. Then 18 more cable curl sessions, three sets of 10 at 40 lb logged at 2 in reserve,
 * a day or two and a half apart, each first set as good as the last. They open Settings, What the
 * app has learned.
 *
 * The rule: the windows are learned from "each session with hard sets for a muscle" (the learned
 * page's own words); every engine reads the log as the rules read it (`readHistory`: "the log as the
 * rules read it ... every engine reads it"; the coach, the Plan screen, the hard start and the
 * completion read the windows from it); the report: "The learned page shows each muscle its sessions
 * moved, with a reset." The page shows what the windows in use learned.
 *
 * What happens: `LearnedValues` gives `learnedSections` the log as logged (`state.history`), and its
 * recovery section reads `learnedWindows` from it. There the curls are hard work (2 in reserve) and
 * the biceps' window learned 12 h shorter: "Biceps: 12 h shorter, from 8 sessions back early and 11
 * sessions rested." The windows in use read the same sets at 4 in reserve: light work, no window, nothing
 * learned for the biceps (`learnedWindows(readHistory)` is empty). The page tells the lifter of a
 * shorter biceps window no screen applies.
 *
 * Synthetic data only.
 */

const NOW = '2026-09-30T12:00:00.000Z';
const HOUR = 3_600_000;

function curls(at: number, id: string, check: boolean): WorkoutRecord {
  const when = new Date(at).toISOString();
  const set = {
    kind: 'working' as const,
    reps: 10,
    weight: 40,
    rir: 2,
    completed: true,
    targetReps: [10, 15] as [number, number],
    targetRir: 2,
    targetWeight: 40,
    loggedAt: when,
  };
  return {
    id,
    startedAt: when,
    completedAt: when,
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
        exerciseId: 'cable-curl',
        plannedSets: 3,
        sets: [
          { ...set, setIndex: 0 },
          { ...set, setIndex: 1 },
          check
            ? { ...set, setIndex: 2, reserveCheck: { total: 14, style: 'hybrid' } }
            : { ...set, setIndex: 2 },
        ],
      },
    ],
  };
}

function history(): WorkoutRecord[] {
  const records: WorkoutRecord[] = [];
  let at = Date.parse(NOW) - 60 * 24 * HOUR;
  for (let week = 0; week < 4; week += 1) {
    records.push(curls(at, `check-${week}`, true));
    at += 7 * 24 * HOUR;
  }
  for (let session = 0; session < 18; session += 1) {
    at += (session % 2 === 0 ? 24 : 60) * HOUR;
    records.push(curls(at, `curls-${session}`, false));
  }
  return records;
}

describe('the learned page’s recovery windows', () => {
  it('shows what the windows in use learned', async () => {
    const { store } = createTestStore({ now: () => NOW });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(NOW), programStyle: 'hybrid', reserveCheck: true },
      createDefaultLocations({ gymAccess: true }, NOW),
    );
    const db = await store.getDatabase();
    for (const record of history()) await db.put('workouts', record);
    await store.hydrate();

    const { readHistory, learnedResets } = store.getSnapshot();
    // The windows every screen reads learned nothing for the biceps: the curls are light work there.
    expect(learnedWindows(readHistory, learnedResets).get('biceps')).toBeUndefined();

    render(
      <Providers store={store}>
        <LearnedValues />
      </Providers>,
    );
    const recovery = screen.getByTestId('learned-recovery');
    expect(recovery.textContent ?? '').not.toMatch(/Biceps: 12 h shorter/);
  });
});
