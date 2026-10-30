import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { plan, profileOf, run, shape } from '../../test/backOffs';
import { interpretFatigue } from '../recovery/fatigue';

/**
 * The eighth review of round N. A refit reads the day's fatigue off the history the main lift's top
 * set reads, its straight days at the back-offs' load taken out, where the plan reads it off the
 * whole log.
 *
 * The spec: fatigue is read from the actual records (src/engine/recovery/fatigue.ts); every
 * recalibration builds a lift's target as the plan does (the round's "as the plan builds it"), and a
 * change of weights at the place (`loading`) fits the sets to the weights there, nothing else.
 *
 * What happens on abb5566: `targetBuilt`'s read is `targetToday({ ...request, history }, …)`, the
 * history `topSetRead` gives (the row's day at the back-offs' load dropped), and `targetToday` reads
 * `interpretFatigue(request.history, …)` off it; the plan (`generateWorkout`) and `targetedSets`
 * read it off the whole history. The row's own sets yesterday, lifted as asked, no longer dilute
 * the reserve drift: "Sets running slightly closer to failure than planned" (-0.9, elevated)
 * becomes "Working 1.5 reps closer to failure than planned" (high).
 *
 * Steps: the row's last top set 170 × 5 at 1 nine days ago; four sessions on the four days before
 * today, yesterday's the upper day with the row at its back-offs' load (160, at 2 as asked, marked)
 * and the incline press lifted under its reserve. The plan for today's pull day: elevated fatigue,
 * top set 175, back-offs 165. A `loading` refit (the place's weights changed, no plate missing):
 * the top set 170 and back-offs 160, "Fatigue is high: hold the load and hit the reps cleanly". The
 * max rebuild (`fittedFrom`'s `targetFor`) reads it the same way.
 *
 * Also fails on 5dc61a7 and e6ed7ed. Synthetic data only.
 */

const ROW = 'barbell-row';

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId: 'pull-arms' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

const rowIn = (workout: GeneratedWorkout): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === ROW)!;

function history(): WorkoutRecord[] {
  // Yesterday: the upper day, the row at its back-offs' load as asked (marked), the incline press
  // a rep or two under its reserve.
  const upper = record(
    1,
    ROW,
    [
      [5, 160, 2],
      [5, 160, 2],
      [5, 160, 2],
    ],
    [4, 6],
    2,
    { templateId: 'upper' },
  );
  upper.entries[0]!.role = 'secondary-strength';
  upper.entries[0]!.atBackOffs = true;
  // Maintenance 33: days in a row no longer score, so two sessions rated too hard and long rests
  // carry the day's fatigue: elevated off the whole log, high off it with the row's day taken out.
  upper.rating = { effort: 'too-hard', pain: false, energyAfter: 2, note: '' };
  const start = Date.parse(upper.startedAt);
  const incline: SetSpec[] = [
    [8, 50, 0],
    [8, 50, 0],
    [8, 50, 1],
    [8, 50, 1],
  ];
  upper.entries.push({
    exerciseId: 'incline-dumbbell-press',
    plannedSets: 4,
    sets: incline.map(([reps, weight, rir], index) => ({
      kind: 'working' as const,
      reps,
      weight,
      rir,
      completed: true,
      setIndex: index,
      targetReps: [6, 10] as [number, number],
      targetRir: 2,
      loggedAt: new Date(start + index * 6 * 60_000).toISOString(),
    })),
  });
  const others = (['leg-curl', 'lateral-raise', 'ez-bar-curl'] as const).map((exerciseId, at) =>
    record(
      at + 2,
      exerciseId,
      [
        [12, 40, null],
        [12, 40, null],
      ],
      [10, 15],
      2,
      at === 0 ? { rating: { effort: 'too-hard', pain: false, energyAfter: 2, note: '' } } : {},
    ),
  );
  return [
    structured(
      9,
      [5, 170, 1],
      [
        [5, 160, 2],
        [5, 160, 2],
        [5, 160, 2],
      ],
    ),
    ...others,
    upper,
  ];
}

describe('a refit of the row on a day of elevated fatigue, its upper day yesterday', () => {
  it('builds the row as the plan does', () => {
    const log = history();
    expect(interpretFatigue(log, RECORD_NOW).level).toBe('elevated');
    const profile = profileOf('hybrid', {
      exercisePreferences: { preferred: [ROW], disliked: [] },
    });
    const workout = plan(log, profile, { templateId: 'pull-arms' });
    const before = rowIn(workout);
    expect(shape(before)[0]).toEqual([175, 1, 'top']);
    const refit = run({ type: 'loading' }, workout, { history: log, profile });
    const after = rowIn(refit.workout);
    const line = (after.progression?.evidence ?? []).join(' / ');
    // On abb5566: [[170, 1, 'top'], [160, 2, 'back-off'] x 3], "Fatigue is high: hold the load".
    expect(shape(after), line).toEqual(shape(before));
  });
});
