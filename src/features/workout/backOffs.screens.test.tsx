import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { sessionFeedback } from '../../engine/strategy/strategy';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { Providers, createTestStore } from '../../test/testStore';
import { WorkoutPreviewCard } from '../today/WorkoutPreviewCard';
import { HistoryDetailSheet } from '../progress/HistoryDetailSheet';
import { EFFORT_EVIDENCE, backOffNote, effortGuidance } from './effort';
import { previousPerformance } from './previousPerformance';
import { describeSet, describeSetPosition, describeSetRange } from './setFormat';

/**
 * Maintenance 32, the owner's item 11, on the screens: a main lift's top set and back-offs named as
 * such, on the preview card, the logger and "Why this target", and the summaries reading the top
 * set. Synthetic data only.
 */

const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.kind === 'gym',
)!;
const BENCH = 'barbell-bench-press';
const profile: UserProfile = {
  ...createDefaultProfile(RECORD_NOW),
  bodyweight: 185,
  programStyle: 'hybrid',
};
const trained = [7, 3].map((daysAgo) =>
  record(
    daysAgo,
    BENCH,
    [
      [5, 185, 2],
      [5, 185, 2],
      [5, 185, 2],
    ],
    [4, 6],
    2,
  ),
);
function benchPlan(): { workout: GeneratedWorkout; bench: WorkoutEntry } {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: trained,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const bench = allEntries(workout.blocks).find((entry) => entry.exerciseId === BENCH)!;
  return { workout, bench };
}
/** A session on the structure, `daysAgo`: a top set, then back-offs. */
function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

describe('the sets named', () => {
  it('"Top set", "Back-off 1", "Back-offs 1–3", "Back-off 2 of 3"', () => {
    const { bench } = benchPlan();
    const [top, first, second, third] = bench.sets.filter((set) => set.kind === 'working');
    expect(describeSet(top!, bench)).toBe('Top set');
    expect(describeSet(first!, bench)).toBe('Back-off 1');
    expect(describeSetRange(first!, third!, bench)).toBe('Back-offs 1–3');
    expect(describeSetPosition(top!, bench)).toBe('Top set');
    expect(describeSetPosition(second!, bench)).toBe('Back-off 2 of 3');
  });

  it('on Today: "1 × 190 × 4-6 @ RIR 1, then 3 × 180 @ RIR 2"', () => {
    const { workout } = benchPlan();
    const handle = createTestStore();
    render(
      <Providers store={handle.store}>
        <WorkoutPreviewCard
          workout={workout}
          defaultEstimatedMinutes={60}
          location={gym}
          onSelect={() => undefined}
          onDurationChange={() => undefined}
          logged={new Set()}
          summary={null}
        />
      </Providers>,
    );
    expect(screen.getByText(/1 × 190 × 4-6 @ RIR 1, then 3 × 180 @ RIR 2/)).toBeTruthy();
  });
});

describe('what the effort and "Why this target" say', () => {
  it('the top set one rep short, the back-offs following it, the evidence first', () => {
    const top = effortGuidance('working', 1, 'primary-strength', false, false, 'top');
    expect(top.why).toBe('top set: stop 1 clean rep short of failure; the back-offs follow it');
    expect(top.evidence[0]).toBe(EFFORT_EVIDENCE.backOffs);
    const backOff = effortGuidance('working', 2, 'primary-strength', false, false, 'back-off');
    expect(backOff.why).toBe('back-off: after the top set, stop 2 clean reps short');
    // A straight set says what it said.
    expect(effortGuidance('working', 2, 'primary-strength').why).toContain(
      'short of failure on every working set',
    );
  });

  it('a line on the structure, none for a lift on straight sets', () => {
    const { workout, bench } = benchPlan();
    expect(backOffNote(bench, 'lb')).toBe(
      "Top set, then 3 back-offs at 180 lb, 5% lighter at 2 in reserve: they follow the top set as you lift it, and back-offs missed never hold back the top set's next step: they widen the drop.",
    );
    const straight = allEntries(workout.blocks).find((entry) => entry.backOffDrop === undefined)!;
    expect(backOffNote(straight, 'lb')).toBeNull();
  });
});

describe('the summaries read the top set', () => {
  const lighterBackOffs = structured(
    2,
    [5, 190, 1],
    [
      [6, 180, 2],
      [6, 180, 2],
      [6, 180, 2],
    ],
  );

  it('"Last time" quotes the top set, not a back-off with more weight times reps', () => {
    expect(previousPerformance([lighterBackOffs], BENCH)).toMatchObject({
      weight: 190,
      reps: 5,
      rir: 1,
      sets: 4,
    });
  });

  it('a top set on target with its back-offs short reads on target, the back-offs said', () => {
    const same = structured(
      1,
      [5, 190, 1],
      [
        [3, 180, 0],
        [3, 180, 0],
        [3, 180, 0],
      ],
    );
    const lines = sessionFeedback(same, [lighterBackOffs, same], profile);
    const line = lines.find((candidate) => candidate.startsWith('Barbell Bench Press'))!;
    expect(line).toBe(
      'Barbell Bench Press: on target at 190 lb × 5; the back-offs ran a rep or more harder than asked, and a second session like it widens their drop.',
    );
  });

  it('the history names the top set and the back-offs', () => {
    render(
      <HistoryDetailSheet
        record={lighterBackOffs}
        units="lb"
        notesFor={() => null}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/top 190 × 5 @ RIR 1 · back-off 180 × 6 @ RIR 2/)).toBeTruthy();
  });

  it('the feedback grades the top set: back-offs short never hold its load', () => {
    const short = structured(
      1,
      [5, 195, 1],
      [
        [3, 185, 0],
        [3, 185, 0],
        [3, 185, 0],
      ],
    );
    const lines = sessionFeedback(short, [lighterBackOffs, short], profile);
    const line = lines.find((candidate) => candidate.startsWith('Barbell Bench Press'))!;
    expect(line).not.toContain('Hold the load');
    expect(line).toContain('the back-offs ran a rep or more harder than asked');
  });
});
