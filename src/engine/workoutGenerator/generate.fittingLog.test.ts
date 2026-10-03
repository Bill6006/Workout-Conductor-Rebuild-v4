import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type ProgramStyle } from '../../core/validation/profile';
import { DUMBBELLS_KEY } from '../loading/loading';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { DurationChoice, GeneratedWorkout } from '../workout/types';
import { FittingLog, SHORTENED_RESTS, gaveBackLine, trimmedLine } from './fittingLog';
import { generateWorkout } from './generate';

/**
 * Maintenance 25, the owner's item 39: "Why this workout" said "Shortened rests toward the
 * realistic minimum." four times on a 30-minute pull day. The fit logged every pass (a notch of
 * rest, one set trimmed) as a line of its own; it now logs each outcome once, with its count.
 */

const NOW = '2026-09-03T14:00:00.000Z';
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const lightHome: LocationProfile = {
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 20, step: 5 }] } },
};
const base = { ...createDefaultProfile(NOW), bodyweight: 185 };

const repeats = (lines: readonly string[]) =>
  lines.filter((line, at) => lines.indexOf(line) !== at);

describe('the fitting log', () => {
  it('says each step once, counting a repeat on the line where it first happened', () => {
    const log = new FittingLog();
    log.add(SHORTENED_RESTS);
    log.add('trimmed|Chin-Up', trimmedLine('Chin-Up'));
    log.add(SHORTENED_RESTS);
    log.add('trimmed|Dumbbell Curl', trimmedLine('Dumbbell Curl'));
    log.add('trimmed|Chin-Up', trimmedLine('Chin-Up'));
    log.add('Left out Hammer Curl so the session fits 30 min.');
    log.add('Left out Hammer Curl so the session fits 30 min.');
    expect(log.lines()).toEqual([
      SHORTENED_RESTS,
      'Trimmed 2 sets from Chin-Up.',
      'Trimmed one set from Dumbbell Curl.',
      'Left out Hammer Curl so the session fits 30 min.',
    ]);
    expect(log.size).toBe(4);
  });

  it('gives a set back in words that fit one set or more', () => {
    expect(gaveBackLine('Chin-Up')(1)).toBe('Gave Chin-Up back a set: the minutes left fit it.');
    expect(gaveBackLine('Chin-Up')(2)).toBe('Gave Chin-Up back 2 sets: the minutes left fit them.');
  });
});

describe('why this workout', () => {
  it("says the owner's pull day's rests line once", () => {
    const workout = generateWorkout({
      profile: base,
      location: lightHome,
      history: [],
      now: NOW,
      duration: 30,
      constraints: { templateId: 'pull-arms' },
    });
    const steps = workout.explanation.fittingSteps;
    expect(steps.filter((step) => step === SHORTENED_RESTS)).toHaveLength(1);
    expect(repeats(steps)).toEqual([]);
  });

  it('never says a line twice, in a fresh plan or a rebuild, and counts sets trimmed from one lift', () => {
    let merged = 0;
    let plans = 0;
    const check = (workout: GeneratedWorkout) => {
      plans += 1;
      expect(repeats(workout.explanation.fittingSteps)).toEqual([]);
      expect(repeats(workout.explanation.reasons)).toEqual([]);
      expect(repeats(workout.compromises)).toEqual([]);
      if (workout.explanation.fittingSteps.some((step) => /^Trimmed \d+ sets from /.test(step)))
        merged += 1;
    };
    for (const place of [gym, home, lightHome]) {
      for (const templateId of ['push-arms', 'pull-arms', 'upper', 'full-body', 'lower']) {
        for (const programStyle of [
          'hybrid',
          'hypertrophy-focus',
          'high-rep',
          'strength-focus',
        ] as ProgramStyle[]) {
          for (const circuits of [false, true]) {
            const profile = {
              ...base,
              programStyle,
              techniques: { supersets: true, dropSets: true, circuits },
              currentLocationId: place.id,
            };
            for (const duration of [15, 30, 45, 'default'] as DurationChoice[]) {
              check(
                generateWorkout({
                  profile,
                  location: place,
                  history: [],
                  now: NOW,
                  duration,
                  constraints: { templateId },
                }),
              );
            }
            // An exact end time rebuilds the default plan and fits it by the same log.
            const plan = generateWorkout({
              profile,
              location: place,
              history: [],
              now: NOW,
              duration: 'default',
              constraints: { templateId },
            });
            const result = recalibrate({
              trigger: { type: 'end-by', time: '2026-09-03T14:25:00.000Z' },
              workout: plan,
              completed: emptyCompleted(),
              lockedEntryIds: [],
              currentEntryId: null,
              duration: 'default',
              profile,
              location: place,
              history: [],
              constraints: emptyConstraints(),
              reason: 'test',
              timestamp: NOW,
            });
            if (result.ok) check(result.workout);
          }
        }
      }
    }
    expect(plans).toBeGreaterThan(500);
    // Sets trimmed from one lift more than once are counted on its line, not logged again.
    expect(merged).toBeGreaterThan(0);
  });

  it('counts the sets given back to one lift on one line', () => {
    // Ending in 14 minutes at home, the strength-focus lower day gives the Romanian deadlift back
    // the two sets the fit trimmed from it.
    const profile = {
      ...base,
      programStyle: 'strength-focus' as ProgramStyle,
      currentLocationId: home.id,
    };
    const plan = generateWorkout({
      profile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    const result = recalibrate({
      trigger: { type: 'end-by', time: '2026-09-03T14:14:00.000Z' },
      workout: plan,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: home,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const steps = result.workout.explanation.fittingSteps;
    expect(steps.filter((step) => step.startsWith('Gave Dumbbell Romanian Deadlift back'))).toEqual(
      ['Gave Dumbbell Romanian Deadlift back 2 sets: the minutes left fit them.'],
    );
  });
});
