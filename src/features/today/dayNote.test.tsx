import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { createSession, type WorkoutSession } from '../../core/state/session';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym as clockGym, profileOf, session } from '../../test/clockDays';
import { RECORD_NOW, record } from '../../test/records';
import { Providers, createTestStore } from '../../test/testStore';
import { WorkoutPreviewCard } from './WorkoutPreviewCard';
import { dayNoteOf } from './dayNote';

/**
 * Maintenance 31, the review of round M: Today's line reads the plan as it was built. A catch-up
 * that could not be built, each lift for what is behind working a muscle trained in the last two
 * days, says so; a second workout says whether what was trained sits out of the usual plan, or that
 * nothing more is left for today, the full session a tap away there. Synthetic data only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const profile = { ...createDefaultProfile(RECORD_NOW, 'gym'), bodyweight: 185 };
const glutes = { muscle: 'glutes' as const, sets: 3, minRir: 1, why: 'behind' as const };
/** Behind, with no lift that leaves the front delts out (the incline presses work both). */
const upperChest = { muscle: 'upper-chest' as const, sets: 3, minRir: 1, why: 'behind' as const };

/** Today's session for a day's offer, as the store keeps it. */
function sessionFor(
  spec: CatchUpSpec,
  history: ReturnType<typeof record>[],
  full = false,
): WorkoutSession {
  const workout = generateWorkout({
    profile,
    location: gym!,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { catchUp: full ? null : spec },
  });
  const session = createSession('key', workout, RECORD_NOW);
  return {
    ...session,
    constraints: { ...session.constraints, catchUp: spec, ...(full ? { fullSession: true } : {}) },
  };
}

describe('a catch-up day', () => {
  it('a catch-up for what is behind, the full session a tap away', () => {
    const today = sessionFor({ kind: 'catch-up', muscles: [glutes], sitOut: [] }, []);
    expect(dayNoteOf(today)).toEqual({
      text: `Not one of your training days: a ${today.workout.duration.estimatedMinutes}-minute catch-up for what is behind this week.`,
      action: { label: 'Full session', full: true },
    });
  });

  it('says so when nothing behind can be caught up today', () => {
    // The front delts trained yesterday: every lift for the upper chest works them.
    const today = sessionFor({ kind: 'catch-up', muscles: [upperChest], sitOut: [] }, [
      record(1, 'arnold-press', [[12, 30, 2]], [8, 12], 2),
    ]);
    expect(today.workout.templateId).not.toBe('catch-up');
    expect(dayNoteOf(today)).toEqual({
      text: 'Not one of your training days, and nothing behind this week can be caught up today.',
    });
  });

  it('says so with no catch-up to offer: a new lifter’s day, or one in a deload week', () => {
    const today = sessionFor({ kind: 'catch-up', muscles: [], sitOut: [] }, [], true);
    const usual = { ...today, constraints: { ...today.constraints } };
    delete usual.constraints.catchUp;
    delete usual.constraints.fullSession;
    expect(dayNoteOf(usual, false)).toEqual({ text: 'Not one of your training days.' });
    expect(dayNoteOf(usual)).toBeNull();
  });

  it('with the full session taken, the catch-up is a tap back', () => {
    const today = sessionFor({ kind: 'catch-up', muscles: [glutes], sitOut: [] }, [], true);
    expect(dayNoteOf(today)).toEqual({
      text: 'Not one of your training days.',
      action: { label: 'Catch-up instead', full: false },
    });
  });
});

describe('a day already trained', () => {
  it('the usual plan without what was trained, when nothing is behind', () => {
    const today = sessionFor({ kind: 'second', muscles: [], sitOut: ['chest', 'triceps'] }, [
      record(0, 'barbell-bench-press', [[8, 135, 2]], [6, 10], 2),
    ]);
    expect(dayNoteOf(today)).toEqual({
      text: 'You trained today, and nothing is behind this week: what you trained sits out.',
    });
  });

  it('leads with what was missed only where a lift went in for it', () => {
    // The front delts trained yesterday, one set of the triceps this morning: every lift for the
    // upper chest behind works the front delts, so only the triceps' remainder goes in.
    const history = [
      session(at(8, 18), [['arnold-press', 3]]),
      session(at(9, 7), [['cable-triceps-pushdown', 1]]),
    ];
    const spec: CatchUpSpec = {
      kind: 'second',
      muscles: [upperChest, { muscle: 'triceps', sets: 2, minRir: 3, why: 'remainder' }],
      sitOut: [],
    };
    const workout = generateWorkout({
      profile: profileOf(),
      location: clockGym,
      history,
      now: at(9, 18),
      duration: 'default',
      constraints: { catchUp: spec },
    });
    expect(workout.templateId).toBe('second-workout');
    expect(workout.explanation.reasons.some((line) => line.includes('leads with'))).toBe(false);
    const base = createSession('key', workout, at(9, 18));
    expect(
      dayNoteOf({ ...base, constraints: { ...base.constraints, catchUp: spec } }),
      describeWorkout(workout).join('; '),
    ).toEqual({
      text: 'You trained today: this one goes easy, with only what is left of today’s work.',
    });
  });

  it('nothing more for today, the full session a tap away, and back', () => {
    const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut: [...MUSCLE_IDS] };
    expect(dayNoteOf(sessionFor(spec, []))).toEqual({
      text: 'You trained today, and nothing is behind this week: nothing more for today.',
      action: { label: 'Full session', full: true },
    });
    expect(dayNoteOf(sessionFor(spec, [], true))).toEqual({
      text: 'You trained today.',
      action: { label: 'Go easy instead', full: false },
    });
  });

  it('shows nothing to start when nothing is left, the line and its button in its place', () => {
    const today = sessionFor({ kind: 'second', muscles: [], sitOut: [...MUSCLE_IDS] }, []);
    const note = dayNoteOf(today)!;
    render(
      <Providers store={createTestStore().store}>
        <WorkoutPreviewCard
          workout={today.workout}
          defaultEstimatedMinutes={today.defaultEstimatedMinutes}
          location={gym}
          onSelect={() => undefined}
          onDurationChange={() => undefined}
          dayNote={{ text: note.text, actionLabel: note.action?.label, onAction: () => undefined }}
        />
      </Providers>,
    );
    expect(screen.queryByTestId('start-workout')).not.toBeInTheDocument();
    expect(screen.getByTestId('day-note-text')).toHaveTextContent('nothing more for today.');
    expect(screen.getByRole('button', { name: 'Full session' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second workout' })).toBeInTheDocument();
  });
});
