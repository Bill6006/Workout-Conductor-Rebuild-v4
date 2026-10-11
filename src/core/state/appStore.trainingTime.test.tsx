import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LearnedValues } from '../../features/settings/LearnedValues';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { requireExercise } from '../../catalog/exercises/catalog';
import { estimateDoneSeconds } from '../../engine/duration/trainingTime';
import { currentPosition } from '../../engine/workout/sequence';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import type { AppStore } from './appStore';
import { doneKeys } from './session';

vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * Maintenance 28, the owner's item 3, through the store and on screen: a finished workout saves the
 * minutes it was trained and the plan's own estimate of its sets, the summary says the training
 * time, and History reads a workout left open for a day as the sets it had.
 */

const MINUTE = 60_000;
const minutesOn = (minutes: number) =>
  new Date(Date.parse(TEST_NOW) + minutes * MINUTE).toISOString();

/** Logs the set the workout is on, as planned. */
async function logCurrent(store: AppStore): Promise<void> {
  const session = store.getSnapshot().session!;
  const keys = doneKeys(session.completed);
  const position = currentPosition(session.workout, (entry, index) =>
    keys.has(`${entry}:${index}`),
  )!;
  const entry = allEntries(session.workout.blocks).find((one) => one.id === position.entryId)!;
  const set = entry.sets.find((one) => one.index === position.setIndex)!;
  await store.logSet(entry.id, set.index, {
    weight: set.targetWeight,
    reps: set.targetReps[0],
    rir: set.targetRir,
  });
}

/** A finished workout `daysAgo` before TEST_NOW, an hour against the plan's fifty minutes. */
function paced(daysAgo: number): WorkoutRecord {
  const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
  return {
    id: `w-paced-${daysAgo}`,
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
    trainingSeconds: 60 * 60,
    estimatedSeconds: 50 * 60,
    entries: [
      {
        exerciseId: 'cable-curl',
        sets: [{ kind: 'working', reps: 12, weight: 40, rir: 2, completed: true }],
      },
    ],
  };
}

describe('training time (Maintenance 28, item 3)', () => {
  it('is saved with the plan’s estimate of the sets done, and the summary says it', async () => {
    let clock = TEST_NOW;
    const { store } = createTestStore({ now: () => clock });
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    store.startWorkout();
    // Sets at minutes 2, 5, 8 and, after a long wait, 40; finished at 40.5. The clock ran 40.5
    // minutes; the wait counts ten, and training ends with the last set.
    for (const minute of [2, 5, 8, 40]) {
      clock = minutesOn(minute);
      const session = store.getSnapshot().session!;
      const keys = doneKeys(session.completed);
      const position = currentPosition(session.workout, (entry, index) =>
        keys.has(`${entry}:${index}`),
      )!;
      const entry = allEntries(session.workout.blocks).find((one) => one.id === position.entryId)!;
      const set = entry.sets.find((one) => one.index === position.setIndex)!;
      await store.logSet(entry.id, set.index, {
        weight: set.targetWeight,
        reps: set.targetReps[0],
        rir: set.targetRir,
      });
    }
    clock = minutesOn(40.5);
    const summary = await store.finishWorkout(null);
    const saved = store.getSnapshot().history.at(-1)!;
    expect(saved.trainingSeconds).toBe((2 + 3 + 3 + 10) * 60);
    expect(saved.elapsedSeconds).toBe(40.5 * 60);
    expect(saved.estimatedSeconds).toBeGreaterThan(0);
    expect(summary.highlights.some((line) => / in 18 min\.$/.test(line))).toBe(true);
    // The completion card's Duration is the training time too (the review of item 3).
    expect(summary.trainingSeconds).toBe(18 * 60);
    act(() => {
      window.location.hash = '#/workout';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const card = await screen.findByTestId('completion-summary');
    expect(card).toHaveTextContent('Duration18 min');
    expect(card).not.toHaveTextContent('40.5 min');
  });

  it('times the sets against the warm-up the workout started with (the review of item 4)', async () => {
    const run = async (change: 'none' | 'length' | 'resume') => {
      let clock = TEST_NOW;
      const { store } = createTestStore({ now: () => clock });
      await store.hydrate();
      await store.completeOnboarding(
        createDefaultProfile(TEST_NOW),
        createDefaultLocations({ gymAccess: true }, TEST_NOW),
      );
      const started = store.getSnapshot().session!.workout.warmup.generalMinutes;
      store.startWorkout();
      expect(store.getSnapshot().session!.completed.warmupMinutes).toBe(started);
      let minute = 6;
      clock = minutesOn(minute);
      await logCurrent(store);
      if (change === 'length') {
        clock = minutesOn(minute + 0.5);
        await store.setDurationChoice(45);
      }
      if (change === 'resume') {
        clock = minutesOn(minute + 0.5);
        store.pauseWorkout();
        clock = minutesOn(minute + 30);
        await store.resumeWorkout();
        minute += 30;
      }
      // The rebuild under way left the plan none of the warm-up, or a short one to start again.
      const after = store.getSnapshot().session!.workout.warmup.generalMinutes;
      for (let index = 0; index < 4; index += 1) {
        minute += 3;
        clock = minutesOn(minute);
        await logCurrent(store);
      }
      clock = minutesOn(minute + 0.5);
      await store.finishWorkout(null);
      const session = store.getSnapshot().session!;
      const performed = new Set(
        session.completed.sets
          .filter((set) => !set.skipped)
          .map((set) => `${set.entryId}:${set.setIndex}`),
      );
      const asStarted = estimateDoneSeconds(
        session.workout.blocks,
        (entryId, setIndex) => performed.has(`${entryId}:${setIndex}`),
        started,
        requireExercise,
      );
      return {
        after,
        started,
        estimated: store.getSnapshot().history.at(-1)!.estimatedSeconds,
        asStarted,
      };
    };
    const length = await run('length');
    expect(length.after).toBe(0);
    expect(length.started).toBeGreaterThan(0);
    expect(length.estimated).toBe(length.asStarted);
    const resume = await run('resume');
    expect(resume.after).toBe(1.5);
    expect(resume.estimated).toBe(resume.asStarted);
  });

  it('loads a saved plan at the pace as it reads now (the review of item 4)', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await store.getDatabase();
    for (const days of [7, 5, 3]) await db.put('workouts', paced(days));
    await store.hydrate();
    const fitted = store.getSnapshot().session!;
    expect(fitted.workout.duration.pace).toBe(1.2);
    const saved = await store.saveCurrentWorkout('Paced');
    expect(saved.workout.duration.pace).toBe(1.2);
    // Forgotten since: the saved plan loads at the plan's own pace, and says nothing of it.
    await store.resetLearned('pace');
    store.loadSavedWorkout(saved.id);
    const loaded = store.getSnapshot().session!.workout;
    expect(loaded.duration.pace).toBeUndefined();
    expect(loaded.explanation.reasons.some((line) => line.startsWith('Fitted at your own'))).toBe(
      false,
    );
    expect(loaded.explanation.time.paceMinutes).toBeUndefined();
    expect(loaded.duration.estimatedMinutes).toBeLessThan(fitted.workout.duration.estimatedMinutes);
    expect(loaded.explanation.summary).toContain(
      `in about ${loaded.duration.estimatedMinutes} min`,
    );
  });

  it('loads a plan saved before the pace was learned at the pace learned since', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const saved = await store.saveCurrentWorkout('Plain');
    expect(saved.workout.duration.pace).toBeUndefined();
    const db = await store.getDatabase();
    for (const days of [7, 5, 3]) await db.put('workouts', paced(days));
    await store.hydrate();
    store.loadSavedWorkout(saved.id);
    const loaded = store.getSnapshot().session!.workout;
    expect(loaded.duration.pace).toBe(1.2);
    expect(loaded.explanation.reasons).toContain(
      "Fitted at your own pace: your workouts take about 20% longer than the plan's own estimate.",
    );
    expect(loaded.explanation.time.paceMinutes).toBeGreaterThan(0);
    // The line sits where a plan built today has it: before the one on rests.
    const lines = loaded.explanation.reasons;
    const rests = lines.findIndex((line) => / rests; supersets (on|off), /.test(line));
    expect(lines.indexOf(lines.find((line) => line.startsWith('Fitted at your own'))!)).toBe(
      rests - 1,
    );
  });

  it('estimates only the sets done: a skip costs no time', async () => {
    const finished = async (skipSecond: boolean) => {
      let clock = TEST_NOW;
      const { store } = createTestStore({ now: () => clock });
      await store.hydrate();
      await store.completeOnboarding(
        createDefaultProfile(TEST_NOW),
        createDefaultLocations({ gymAccess: true }, TEST_NOW),
      );
      store.startWorkout();
      const next = () => {
        const session = store.getSnapshot().session!;
        const keys = doneKeys(session.completed);
        const position = currentPosition(session.workout, (entry, index) =>
          keys.has(`${entry}:${index}`),
        )!;
        const entry = allEntries(session.workout.blocks).find(
          (one) => one.id === position.entryId,
        )!;
        return { entry, set: entry.sets.find((one) => one.index === position.setIndex)! };
      };
      clock = minutesOn(2);
      const first = next();
      await store.logSet(first.entry.id, first.set.index, {
        weight: first.set.targetWeight,
        reps: first.set.targetReps[0],
        rir: first.set.targetRir,
      });
      if (skipSecond) {
        clock = minutesOn(5);
        const second = next();
        await store.logSet(second.entry.id, second.set.index, {
          weight: null,
          reps: 0,
          rir: null,
        });
      }
      clock = minutesOn(6);
      await store.finishWorkout(null, { endedEarly: true });
      return store.getSnapshot().history.at(-1)!.estimatedSeconds;
    };
    expect(await finished(true)).toBe(await finished(false));
  });

  it('shows History by the minutes trained, not the hours the workout stayed open', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    // Sixteen sets three minutes apart from minute 2, then open for a day: 1504 minutes.
    const begun = new Date(Date.parse(TEST_NOW) - 3 * 86_400_000).toISOString();
    const at = (minutes: number) => new Date(Date.parse(begun) + minutes * MINUTE).toISOString();
    const open: WorkoutRecord = {
      id: 'w-open',
      startedAt: begun,
      completedAt: at(1504),
      locationId: 'gym',
      templateId: 'full-body',
      endedEarly: false,
      rating: null,
      skippedExerciseIds: [],
      painJoints: [],
      readiness: null,
      prs: [],
      plannedMinutes: 60,
      elapsedSeconds: 1504 * 60,
      entries: [
        {
          exerciseId: 'back-squat',
          sets: Array.from({ length: 16 }, (_, index) => ({
            kind: 'working' as const,
            reps: 5,
            weight: 185,
            rir: 2,
            completed: true,
            loggedAt: at(2 + index * 3),
          })),
        },
      ],
    };
    const db = await store.getDatabase();
    await db.put('workouts', open);
    await store.hydrate();
    act(() => {
      window.location.hash = '#/progress';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    // 2 to the first set and 45 of sets.
    await waitFor(() =>
      expect(screen.getAllByTestId('history-row')[0]).toHaveTextContent('47 min'),
    );
    expect(screen.getAllByTestId('history-row')[0]).not.toHaveTextContent('1504');
    // Its detail says the same.
    await userEvent.setup().click(screen.getAllByTestId('history-row')[0]!);
    expect(await screen.findByRole('dialog')).toHaveTextContent('47 min of 60 planned');
  });

  it('forgets the pace from the page, after asking once more', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    render(
      <Providers store={store}>
        <LearnedValues />
      </Providers>,
    );
    const pace = screen.getByTestId('learned-pace');
    const user = userEvent.setup();
    await user.click(within(pace).getByTestId('learned-reset-pace'));
    expect(store.getSnapshot().learnedResets.pace).toBeUndefined();
    await user.click(within(pace).getByTestId('learned-confirm-pace'));
    await waitFor(() => expect(store.getSnapshot().learnedResets.pace).toBe(TEST_NOW));
  });
});
