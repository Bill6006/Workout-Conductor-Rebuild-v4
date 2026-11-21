import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { pushLine } from '../planning/pushLift';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout, mainLiftName } from './generate';
import { withOrderLines } from './orderLines';

/**
 * The owner, 2026-11-02: after a lift was swapped on Today, Why this workout still said the lift
 * swapped out "leads as the primary strength lift". The lines on what leads are read from the plan
 * they describe. Synthetic data only.
 */

const NOW = '2026-09-02T12:00:00.000Z';
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const leads = (name: string) =>
  `${name} leads as the primary strength lift with full rests and warm-up ramp sets.`;
const mains = (lines: readonly string[]) => lines.filter((line) => mainLiftName(line) !== null);

/** Today's push day at the Gym: the barbell bench press first, the one primary strength lift. */
function plan(): { workout: GeneratedWorkout; bench: WorkoutEntry } {
  const workout = generateWorkout({
    profile: { ...createDefaultProfile(NOW), bodyweight: 185 },
    location: gym,
    history: [],
    now: NOW,
    duration: 'default',
  });
  const entries = allEntries(workout.blocks);
  const bench = entries[0]!;
  expect(bench.exerciseId).toBe('barbell-bench-press');
  expect(entries.filter((entry) => entry.role === 'primary-strength')).toEqual([bench]);
  expect(mains(workout.explanation.reasons)).toEqual([leads('Barbell Bench Press')]);
  return { workout, bench };
}

/** The bench press swapped for the dumbbells on Today, as the swap leaves the entry. */
function swapped(bench: WorkoutEntry): void {
  bench.exerciseId = 'dumbbell-bench-press';
  bench.replacedFrom = 'barbell-bench-press';
}

describe('the lines on what leads (the owner, 2026-11-02)', () => {
  it('leave a plan as it was built as they are', () => {
    const { workout } = plan();
    expect(withOrderLines(workout.explanation.reasons, workout.blocks)).toEqual(
      workout.explanation.reasons,
    );
  });

  it('name the lift swapped in, never the lift swapped out, the other lines kept', () => {
    const { workout, bench } = plan();
    swapped(bench);
    const lines = withOrderLines(workout.explanation.reasons, workout.blocks);
    expect(mains(lines)).toEqual([leads('Dumbbell Bench Press')]);
    expect(lines.join(' ')).not.toContain('Barbell Bench Press leads');
    expect(lines).toEqual(
      workout.explanation.reasons.map((line) =>
        line === leads('Barbell Bench Press') ? leads('Dumbbell Bench Press') : line,
      ),
    );
  });

  it('name a stand-in carrying the main lift’s sets once begun', () => {
    const { workout, bench } = plan();
    bench.stopped = { owed: 2, why: 'swap' };
    const stand: WorkoutEntry = {
      ...structuredClone(bench),
      id: 'stand-in',
      exerciseId: 'dumbbell-bench-press',
      replacedFrom: 'barbell-bench-press',
    };
    delete stand.stopped;
    workout.blocks.splice(1, 0, { ...structuredClone(workout.blocks[0]!), entries: [stand] });
    expect(mains(withOrderLines(workout.explanation.reasons, workout.blocks))).toEqual([
      leads('Dumbbell Bench Press'),
    ]);
  });

  it('pass over the week’s extra to the main lift, which then leads no more', () => {
    const { workout, bench } = plan();
    swapped(bench);
    const extra: WorkoutEntry = {
      ...structuredClone(bench),
      id: 'extra',
      exerciseId: 'machine-chest-press',
      push: 'extra',
    };
    delete extra.replacedFrom;
    workout.blocks.unshift({ ...structuredClone(workout.blocks[0]!), entries: [extra] });
    expect(mains(withOrderLines(workout.explanation.reasons, workout.blocks))).toEqual([
      'Dumbbell Bench Press is the primary strength lift, with full rests and warm-up ramp sets.',
    ]);
  });

  it('keep a stopped main lift’s line while nothing carries its work: it is still the day’s', () => {
    const { workout, bench } = plan();
    bench.stopped = { owed: 2 };
    expect(withOrderLines(workout.explanation.reasons, workout.blocks)).toEqual(
      workout.explanation.reasons,
    );
  });

  it('go with a lift taken out where no lift has its role', () => {
    const { workout } = plan();
    workout.blocks.splice(0, 1);
    expect(allEntries(workout.blocks).some((entry) => entry.role === 'primary-strength')).toBe(
      false,
    );
    const lines = withOrderLines(workout.explanation.reasons, workout.blocks);
    expect(mains(lines)).toEqual([]);
    expect(lines).toHaveLength(workout.explanation.reasons.length - 1);
    // The plan as saved keeps it as it was, for a swap back (the review).
    expect(withOrderLines(workout.explanation.reasons, workout.blocks, true)).toEqual(
      workout.explanation.reasons,
    );
  });

  it('never name one lift twice', () => {
    const { workout, bench } = plan();
    swapped(bench);
    const lines = withOrderLines(
      [...workout.explanation.reasons, leads('Dumbbell Bench Press')],
      workout.blocks,
    );
    expect(mains(lines)).toEqual([leads('Dumbbell Bench Press')]);
  });

  it('drop the line on a lift to push once it is swapped out', () => {
    const { workout, bench } = plan();
    bench.push = 'natural';
    const push = pushLine('Barbell Bench Press', '225 lb', false, true);
    const reasons = [push, ...workout.explanation.reasons];
    expect(withOrderLines(reasons, workout.blocks)).toContain(push);
    swapped(bench);
    expect(withOrderLines(reasons, workout.blocks)).not.toContain(push);
    // The plan as saved keeps it, so a swap back finds it again (the review).
    expect(withOrderLines(reasons, workout.blocks, true)).toContain(push);
  });

  it('drop the line on a lift to push stopped once begun, a stand-in carrying its sets', () => {
    const { workout, bench } = plan();
    bench.push = 'natural';
    const push = pushLine('Barbell Bench Press', '225 lb', false, true);
    const reasons = [push, ...workout.explanation.reasons];
    bench.stopped = { owed: 2, why: 'swap' };
    const stand: WorkoutEntry = {
      ...structuredClone(bench),
      id: 'stand-in',
      exerciseId: 'dumbbell-bench-press',
      replacedFrom: 'barbell-bench-press',
    };
    delete stand.stopped;
    workout.blocks.splice(1, 0, { ...structuredClone(workout.blocks[0]!), entries: [stand] });
    // The review: the bench press still "led" beside the dumbbells' line.
    const lines = withOrderLines(reasons, workout.blocks);
    expect(lines).not.toContain(push);
    expect(mains(lines)).toEqual([leads('Dumbbell Bench Press')]);
    expect(withOrderLines(reasons, workout.blocks, true)).toContain(push);
  });

  it('follow the first lift where the plan was built with none in the main lift’s role', () => {
    // A catch-up for the side delts and the biceps (the review): the lateral raise leads it.
    const catchUp = {
      kind: 'catch-up' as const,
      muscles: [
        { muscle: 'side-delts' as const, sets: 3, minRir: 1, why: 'behind' as const },
        { muscle: 'biceps' as const, sets: 2, minRir: 1, why: 'behind' as const },
      ],
      sitOut: [],
    };
    const workout = generateWorkout({
      profile: { ...createDefaultProfile(NOW), bodyweight: 185 },
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { catchUp },
    });
    const raise = allEntries(workout.blocks)[0]!;
    expect(raise.exerciseId).toBe('lateral-raise');
    const isolation = (name: string) =>
      `${name} leads as the isolation lift with full rests and warm-up ramp sets.`;
    expect(mains(workout.explanation.reasons)).toEqual([isolation('Lateral Raise')]);
    // Swapped on Today, the line follows the lift in its place; swapped back, it comes back.
    raise.exerciseId = 'cable-lateral-raise';
    raise.replacedFrom = 'lateral-raise';
    const swappedLines = withOrderLines(workout.explanation.reasons, workout.blocks, true);
    expect(mains(swappedLines)).toEqual([isolation('Cable Lateral Raise')]);
    raise.exerciseId = 'lateral-raise';
    delete raise.replacedFrom;
    expect(withOrderLines(swappedLines, workout.blocks, true)).toEqual(
      workout.explanation.reasons,
    );
  });
});
