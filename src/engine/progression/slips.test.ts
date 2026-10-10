import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { RECORD_NOW, record } from '../../test/records';
import { estimateFromOtherLifts } from './crossEstimate';
import { maxFromSet } from './maxes';
import { estimateStartingMax } from './startingLoad';
import {
  SLIP_OVER_BODY,
  SLIP_OVER_HISTORY,
  bestLoggedMax,
  bodyweightSlip,
  repsSlip,
  weightSlip,
} from './slips';

const bench = requireExercise('barbell-bench-press');
const dumbbell = requireExercise('dumbbell-bench-press');
const chinUp = requireExercise('chin-up');
const profile = {
  bodyweight: 180,
  experience: 'intermediate' as const,
  sex: 'male' as const,
  age: 30,
  units: 'lb' as const,
};

describe('bestLoggedMax (Maintenance 26, item 40)', () => {
  it('reads the best working set as the max sheet reads one, every rep up to thirty', () => {
    const history = [
      record(3, bench.id, [
        [5, 225, 1],
        [8, 185, 2],
      ]),
      // Twenty-five reps at 150 read as a max of 275, more than 225 × 5: the best.
      record(10, bench.id, [[25, 150, 0]]),
    ];
    expect(bestLoggedMax(history, bench)).toEqual({
      e1rm: maxFromSet(150, 25),
      weight: 150,
      reps: 25,
    });
    // Forty reps count as thirty, as the max sheet reads them.
    expect(bestLoggedMax([record(10, bench.id, [[40, 100, 0]])], bench)?.e1rm).toBe(
      maxFromSet(100, 30),
    );
  });

  it('skips warm-ups, unfinished sets, sets with no weight and other lifts', () => {
    const history = [
      record(3, bench.id, [[5, 225, 1]], [4, 6], 2, {
        entries: [
          {
            exerciseId: bench.id,
            sets: [
              { kind: 'warmup', reps: 5, weight: 400, rir: null, completed: true },
              { kind: 'working', reps: 5, weight: 400, rir: null, completed: false },
              { kind: 'working', reps: 5, weight: null, rir: null, completed: true },
            ],
          },
          {
            exerciseId: dumbbell.id,
            sets: [{ kind: 'working', reps: 5, weight: 90, rir: 1, completed: true }],
          },
        ],
      }),
    ];
    expect(bestLoggedMax(history, bench)).toBeNull();
  });
});

describe('weightSlip', () => {
  const history = [record(3, bench.id, [[5, 225, 1]])];
  const best = maxFromSet(225, 5);

  it('questions a set whose max is far above anything logged for the lift', () => {
    const question = weightSlip({ exercise: bench, weight: 1850, reps: 5, units: 'lb', history });
    expect(question?.field).toBe('weight');
    expect(question?.text).toBe(
      '1850 lb is more than 1000 lb: more than almost anyone loads on Barbell Bench Press.',
    );
    const typo = weightSlip({ exercise: bench, weight: 425, reps: 5, units: 'lb', history });
    expect(typo?.text).toBe(
      '425 lb × 5 is far above anything logged for Barbell Bench Press (best 225 lb × 5).',
    );
  });

  it('lets a real best through, up to one and a half times the logged max', () => {
    const edge = (best * SLIP_OVER_HISTORY) / (1 + 5 / 30);
    expect(weightSlip({ exercise: bench, weight: 315, reps: 5, units: 'lb', history })).toBeNull();
    expect(
      weightSlip({ exercise: bench, weight: Math.floor(edge), reps: 5, units: 'lb', history }),
    ).toBeNull();
    expect(
      weightSlip({ exercise: bench, weight: Math.ceil(edge) + 1, reps: 5, units: 'lb', history }),
    ).not.toBeNull();
  });

  it('never questions a lower weight or max', () => {
    expect(weightSlip({ exercise: bench, weight: 45, reps: 5, units: 'lb', history })).toBeNull();
    expect(
      weightSlip({ exercise: bench, weight: 100, reps: 1, max: true, units: 'lb', history }),
    ).toBeNull();
  });

  it('reads a typed one-rep max as the max itself', () => {
    const question = weightSlip({
      exercise: bench,
      weight: 650,
      reps: 1,
      max: true,
      units: 'lb',
      history,
    });
    expect(question?.text).toBe(
      'A max of 650 lb is far above anything logged for Barbell Bench Press (best 225 lb × 5).',
    );
    expect(
      weightSlip({ exercise: bench, weight: 330, reps: 1, max: true, units: 'lb', history }),
    ).toBeNull();
  });

  it('questions a set the weights here cannot make, but not a max', () => {
    const question = weightSlip({
      exercise: bench,
      weight: 300,
      reps: 5,
      units: 'lb',
      history,
      heaviest: 285,
    });
    expect(question?.text).toBe(
      '300 lb is more than the weights here make for Barbell Bench Press (up to 285 lb).',
    );
    expect(
      weightSlip({ exercise: bench, weight: 285, reps: 5, units: 'lb', history, heaviest: 285 }),
    ).toBeNull();
    expect(
      weightSlip({
        exercise: bench,
        weight: 300,
        reps: 1,
        max: true,
        units: 'lb',
        history,
        heaviest: 285,
      }),
    ).toBeNull();
  });

  it('holds every lift to a ceiling no one loads, by the kind of load and the units', () => {
    expect(
      weightSlip({ exercise: bench, weight: 1000, reps: 1, units: 'lb', history: [] }),
    ).toBeNull();
    expect(
      weightSlip({ exercise: bench, weight: 1001, reps: 1, units: 'lb', history: [] })?.field,
    ).toBe('weight');
    expect(
      weightSlip({ exercise: dumbbell, weight: 251, reps: 1, units: 'lb', history: [] }),
    ).not.toBeNull();
    expect(
      weightSlip({ exercise: dumbbell, weight: 250, reps: 1, units: 'lb', history: [] }),
    ).toBeNull();
    expect(
      weightSlip({ exercise: bench, weight: 451, reps: 1, units: 'kg', history: [] }),
    ).not.toBeNull();
    expect(
      weightSlip({ exercise: dumbbell, weight: 116, reps: 1, units: 'kg', history: [] }),
    ).not.toBeNull();
    // Added load on a lift done at bodyweight is held like one dumbbell.
    expect(
      weightSlip({ exercise: chinUp, weight: 260, reps: 5, units: 'lb', history: [] }),
    ).not.toBeNull();
  });

  it('with nothing logged, questions a max far above what the body suggests', () => {
    const body = estimateStartingMax(bench, profile);
    expect(body).not.toBeNull();
    const limit = (body?.e1rm ?? 0) * SLIP_OVER_BODY;
    const question = weightSlip({
      exercise: bench,
      weight: Math.ceil(limit) + 5,
      reps: 1,
      max: true,
      units: 'lb',
      history: [],
      profile,
    });
    expect(question?.text).toMatch(
      /^A max of \d+ lb is far above what your bodyweight and experience suggest for Barbell Bench Press \(a max of about \d+ lb\)\.$/,
    );
    expect(
      weightSlip({
        exercise: bench,
        weight: Math.floor(limit),
        reps: 1,
        max: true,
        units: 'lb',
        history: [],
        profile,
      }),
    ).toBeNull();
    // Without a bodyweight there is nothing to compare with, short of the ceiling.
    expect(
      weightSlip({ exercise: bench, weight: 900, reps: 1, max: true, units: 'lb', history: [] }),
    ).toBeNull();
  });

  it("compares with the lift's own history before the body", () => {
    // 315 × 5 is plausible against a logged 225 × 5, though far past the body's estimate here.
    const light = { ...profile, bodyweight: 100, experience: 'beginner' as const };
    expect(
      weightSlip({ exercise: bench, weight: 315, reps: 5, units: 'lb', history, profile: light }),
    ).toBeNull();
  });
});

describe('weightSlip after the review of item 40', () => {
  const carry = requireExercise('farmer-carry');
  const legPress = requireExercise('leg-press');

  it("counts today's sets with the history: a heavier set kept today is not asked about again", () => {
    const history = [record(7, dumbbell.id, [[12, 30, 2]])];
    const asked = { exercise: dumbbell, weight: 55, reps: 8, units: 'lb' as const, history };
    expect(weightSlip(asked)).not.toBeNull();
    expect(weightSlip({ ...asked, today: [{ weight: 50, reps: 10 }] })).toBeNull();
    // Today's sets are read as the history is: warm-up weights below them change nothing.
    expect(weightSlip({ ...asked, weight: 120, today: [{ weight: 50, reps: 10 }] })).not.toBeNull();
  });

  it('reads a hold by its load, never its seconds as reps', () => {
    const history = [record(7, carry.id, [[40, 30, null]])];
    const at = { exercise: carry, reps: 40, units: 'lb' as const, history };
    expect(weightSlip({ ...at, weight: 35 })).toBeNull();
    expect(weightSlip({ ...at, weight: 45 })).toBeNull();
    expect(weightSlip({ ...at, weight: 50 })?.text).toBe(
      '50 lb per hand is far above anything logged for Farmer Carry (heaviest 30 lb per hand).',
    );
    expect(bestLoggedMax(history, carry)).toEqual({ e1rm: 30, weight: 30, reps: 40 });
  });

  it('takes the max the lifter saved as their own word: a lower one is never asked about', () => {
    const at = { exercise: bench, reps: 1, max: true, units: 'lb' as const, history: [] };
    const light = { ...profile, bodyweight: 120, experience: 'beginner' as const };
    expect(weightSlip({ ...at, weight: 400, profile: light })).not.toBeNull();
    expect(weightSlip({ ...at, weight: 400, profile: light, saved: 450 })).toBeNull();
    expect(weightSlip({ ...at, weight: 650, profile: light, saved: 400 })?.text).toBe(
      'A max of 650 lb is far above anything logged for Barbell Bench Press (the max you saved, 400 lb).',
    );
    // With sets of its own as well, the higher of the two stands.
    const history = [record(3, bench.id, [[5, 225, 1]])];
    expect(weightSlip({ ...at, weight: 550, history, saved: 400 })).toBeNull();
  });

  it("with no sets of the lift's own, compares with what its family suggests before the body", () => {
    const history = [record(7, dumbbell.id, [[8, 100, 1]])];
    const at = { exercise: bench, reps: 1, max: true, units: 'lb' as const, history };
    const light = { ...profile, bodyweight: 120, experience: 'beginner' as const };
    // Strong on dumbbells: a real barbell max the body alone would question.
    const real = weightSlip({ ...at, weight: 400, history: [], profile: light });
    expect(real).not.toBeNull();
    expect(weightSlip({ ...at, weight: 400, profile: light })).toBeNull();
    expect(weightSlip({ ...at, weight: 900, profile: light })?.text).toMatch(
      /^A max of 900 lb is far above what your related lifts suggest for Barbell Bench Press \(a max of about \d+ lb\)\.$/,
    );
  });

  it('questions a bar lift lighter than its empty bar, unless the lift was logged that light', () => {
    const history = [record(3, bench.id, [[5, 135, 1]])];
    expect(weightSlip({ exercise: bench, weight: 13, reps: 5, units: 'lb', history })?.text).toBe(
      '13 lb is less than the empty bar (45 lb) for Barbell Bench Press.',
    );
    expect(weightSlip({ exercise: bench, weight: 45, reps: 5, units: 'lb', history })).toBeNull();
    // A lighter bar of the lifter's own, logged before: asked once, never again.
    const light = [record(3, bench.id, [[10, 35, 2]])];
    expect(
      weightSlip({ exercise: bench, weight: 35, reps: 5, units: 'lb', history: light }),
    ).toBeNull();
    // Today's sets count too: a ramp at 35 today.
    expect(
      weightSlip({
        exercise: bench,
        weight: 35,
        reps: 5,
        units: 'lb',
        history,
        today: [{ weight: 35, reps: 8, working: false }],
      }),
    ).toBeNull();
    expect(
      weightSlip({ exercise: bench, weight: 15, reps: 1, max: true, units: 'kg', history: [] })
        ?.text,
    ).toBe('A max of 15 kg is less than the empty bar (20 kg) for Barbell Bench Press.');
  });

  it('reads weight added to the body with the body, and questions as much again as the lifter weighs', () => {
    const at = { exercise: chinUp, reps: 8, units: 'lb' as const, profile };
    expect(weightSlip({ ...at, weight: 180, history: [] })?.text).toBe(
      '180 lb added is as much as you weigh (180 lb): far more than almost anyone adds on Chin-Up.',
    );
    const history = [record(7, chinUp.id, [[10, 0, 2]])];
    expect(weightSlip({ ...at, weight: 25, history })).toBeNull();
    expect(weightSlip({ ...at, weight: 120, history })?.text).toBe(
      '120 lb added × 8 is far above anything logged for Chin-Up (best 10 reps at bodyweight).',
    );
    // With no bodyweight saved there is nothing to read it with, short of the ceiling.
    expect(
      weightSlip({ ...at, weight: 120, history, profile: { ...profile, bodyweight: undefined } }),
    ).toBeNull();
  });

  it('holds a sled to its own ceiling, far past a stack', () => {
    const at = { exercise: legPress, reps: 1, units: 'lb' as const, history: [] };
    expect(weightSlip({ ...at, weight: 1500 })).toBeNull();
    expect(weightSlip({ ...at, weight: 2001 })?.text).toBe(
      '2001 lb is more than 2000 lb: more than almost anyone loads on Leg Press.',
    );
  });

  it('says per hand where a dumbbell is meant', () => {
    const light = {
      ...profile,
      bodyweight: 120,
      experience: 'beginner' as const,
      sex: 'female' as const,
    };
    const question = weightSlip({
      exercise: dumbbell,
      weight: 200,
      reps: 1,
      max: true,
      units: 'lb',
      history: [],
      profile: light,
    });
    expect(question?.text).toMatch(
      /^A max of 200 lb per hand is far above .* \(a max of about \d+ lb per hand\)\.$/,
    );
  });
});

describe('repsSlip', () => {
  it('questions reps past three times the top of the range and fifteen over it', () => {
    expect(repsSlip(36, [8, 12])).toBeNull();
    expect(repsSlip(37, [8, 12])).toEqual({
      field: 'reps',
      text: '37 reps is far past the target of 8-12.',
    });
    expect(repsSlip(18, [1, 3])).toBeNull();
    expect(repsSlip(19, [1, 3])).not.toBeNull();
    expect(repsSlip(45, [26, 30])).toBeNull();
    expect(repsSlip(91, [26, 30])).not.toBeNull();
  });
});

describe('bodyweightSlip', () => {
  it('questions a bodyweight outside 30 to 300 kg', () => {
    expect(bodyweightSlip(1800, 180, 'lb')?.text).toBe(
      "1800 lb is outside a bodyweight's usual range (66 to 660 lb).",
    );
    expect(bodyweightSlip(18, 180, 'lb')).not.toBeNull();
    expect(bodyweightSlip(29, undefined, 'kg')).not.toBeNull();
    expect(bodyweightSlip(80, undefined, 'kg')).toBeNull();
  });

  it('questions a move of more than a quarter from the saved one, either way', () => {
    expect(bodyweightSlip(220, 180, 'lb')).toBeNull();
    expect(bodyweightSlip(230, 180, 'lb')?.text).toBe(
      '230 lb is far from your saved bodyweight (180 lb).',
    );
    expect(bodyweightSlip(130, 180, 'lb')).not.toBeNull();
    expect(bodyweightSlip(140, 180, 'lb')).toBeNull();
    expect(bodyweightSlip(180, 180, 'lb')).toBeNull();
  });
});

describe('weightSlip and repsSlip after the re-check of item 40', () => {
  const pullUp = requireExercise('pull-up');
  const pulldown = requireExercise('lat-pulldown');
  const stepUp = requireExercise('step-up');

  it('still asks about a bar lighter than empty after a heavier set today', () => {
    expect(
      weightSlip({
        exercise: bench,
        weight: 13,
        reps: 5,
        units: 'lb',
        history: [],
        today: [{ weight: 135, reps: 5 }],
      })?.text,
    ).toBe('13 lb is less than the empty bar (45 lb) for Barbell Bench Press.');
    // A weight no heavier than one lifted today is not asked about as too heavy.
    expect(
      weightSlip({
        exercise: bench,
        weight: 1200,
        reps: 5,
        units: 'lb',
        history: [],
        today: [{ weight: 1250, reps: 5 }],
      }),
    ).toBeNull();
  });

  it('takes no family lift without a load of its own as a reference', () => {
    // With no bodyweight saved there is no body's estimate: only the family could ask.
    const history = [record(7, pullUp.id, [[8, 25, 1]])];
    expect(
      weightSlip({ exercise: pulldown, weight: 120, reps: 8, units: 'lb', history }),
    ).toBeNull();
  });

  it('compares with the larger of the family and the body: a light day elsewhere asks nothing', () => {
    const history = [record(7, dumbbell.id, [[12, 30, 2]])];
    expect(
      weightSlip({ exercise: bench, weight: 235, reps: 5, units: 'lb', history, profile }),
    ).toBeNull();
    expect(
      weightSlip({ exercise: bench, weight: 935, reps: 5, units: 'lb', history, profile })?.text,
    ).toMatch(/^935 lb × 5 is far above what your bodyweight and experience suggest/);
  });

  it('holds weight added on any lift done at bodyweight to the added ceiling', () => {
    const benchDip = requireExercise('bench-dip');
    expect(
      weightSlip({ exercise: benchDip, weight: 400, reps: 8, units: 'lb', history: [] })?.text,
    ).toBe('400 lb added is more than 250 lb: more than almost anyone loads on Bench Dip.');
    // The lower body too: the catalog adds it with dumbbells (the fourth pass of item 40).
    expect(
      weightSlip({ exercise: stepUp, weight: 400, reps: 8, units: 'lb', history: [] })?.text,
    ).toBe('400 lb added is more than 250 lb: more than almost anyone loads on Step-Up.');
  });

  it('asks about reps once: reps the lift has logged are no slip', () => {
    expect(repsSlip(60, [10, 15])).not.toBeNull();
    expect(repsSlip(60, [10, 15], [60])).toBeNull();
    expect(repsSlip(61, [10, 15], [60])).not.toBeNull();
  });
});

describe('weightSlip and bodyweightSlip after the third pass of item 40', () => {
  const squat = requireExercise('back-squat');
  const dip = requireExercise('dip');
  const glute = requireExercise('glute-bridge');
  const legExtension = requireExercise('leg-extension');
  const lightFemale = {
    ...profile,
    bodyweight: 120,
    experience: 'beginner' as const,
    sex: 'female' as const,
  };

  it("covers a set only with one of today's as heavy and of as many reps: 155 for 6 is no 155 for 30", () => {
    const history = [record(7, bench.id, [[6, 155, 1]])];
    const at = {
      exercise: bench,
      units: 'lb' as const,
      history,
      today: [{ weight: 155, reps: 6 }],
    };
    expect(weightSlip({ ...at, weight: 155, reps: 30 })?.text).toBe(
      '155 lb × 30 is far above anything logged for Barbell Bench Press (best 155 lb × 6).',
    );
    expect(weightSlip({ ...at, weight: 155, reps: 6 })).toBeNull();
    expect(weightSlip({ ...at, weight: 150, reps: 5 })).toBeNull();
  });

  it("covers a set with one of today's of any kind as heavy and of as many reps: a ramp kept once", () => {
    const history = [record(7, bench.id, [[10, 45, 2]])];
    const at = { exercise: bench, weight: 135, reps: 5, units: 'lb' as const, history };
    expect(weightSlip(at)).not.toBeNull();
    expect(weightSlip({ ...at, today: [{ weight: 135, reps: 5, working: false }] })).toBeNull();
  });

  it('asks about the ceiling once: a weight the lift has lifted before is not asked about again', () => {
    const history = [record(7, squat.id, [[1, 1100, 0]])];
    const at = { exercise: squat, reps: 1, units: 'lb' as const };
    expect(weightSlip({ ...at, weight: 1100, history: [] })).not.toBeNull();
    expect(weightSlip({ ...at, weight: 1100, history })).toBeNull();
    expect(weightSlip({ ...at, weight: 1105, history })?.text).toBe(
      '1105 lb is more than 1000 lb: more than almost anyone loads on Back Squat.',
    );
  });

  it('asks about the weights here once: the lift logged that heavy at this place is not asked again', () => {
    const history = [record(7, dumbbell.id, [[8, 60, 1]])];
    const at = { exercise: dumbbell, weight: 60, reps: 8, units: 'lb' as const, heaviest: 50 };
    expect(weightSlip({ ...at, history: [], place: 'gym' })?.text).toBe(
      '60 lb per hand is more than the weights here make for Dumbbell Bench Press (up to 50 lb per hand).',
    );
    expect(weightSlip({ ...at, history, place: 'gym' })).toBeNull();
    // Logged that heavy at another place says nothing of this one.
    expect(weightSlip({ ...at, history, place: 'home' })).not.toBeNull();
  });

  it('asks once about as much added as the lifter weighs, and never on the lower body', () => {
    const at = { exercise: dip, weight: 185, reps: 6, units: 'lb' as const, profile };
    expect(weightSlip({ ...at, history: [] })?.text).toBe(
      '185 lb added is as much as you weigh (180 lb): far more than almost anyone adds on Dip.',
    );
    expect(weightSlip({ ...at, history: [record(7, dip.id, [[6, 185, 1]])] })).toBeNull();
    const light = { ...profile, bodyweight: 130 };
    const bridge = { exercise: glute, reps: 10, units: 'lb' as const, history: [], profile: light };
    expect(weightSlip({ ...bridge, weight: 185 })).toBeNull();
    // Past the added ceiling it is asked about, once (the fourth pass).
    expect(weightSlip({ ...bridge, weight: 275 })?.text).toBe(
      '275 lb added is more than 250 lb: more than almost anyone loads on Glute Bridge.',
    );
  });

  it("asks about a first set at three and a half times the body's estimate, not at an ordinary beginner's", () => {
    // 100 × 5 on the bench reads 2.7 times the estimate for a beginner of 120 lb.
    const at = {
      exercise: bench,
      reps: 5,
      units: 'lb' as const,
      history: [],
      profile: lightFemale,
    };
    expect(weightSlip({ ...at, weight: 100 })).toBeNull();
    const body = estimateStartingMax(bench, lightFemale)?.e1rm ?? 0;
    const over = Math.ceil((body * SLIP_OVER_BODY) / (1 + 5 / 30)) + 5;
    expect(weightSlip({ ...at, weight: over })?.text).toMatch(
      /far above what your bodyweight and experience suggest for Barbell Bench Press/,
    );
  });

  it('reads a set past twenty reps, so it still says what the lift can do', () => {
    const history = [record(7, legExtension.id, [[25, 100, 0]])];
    const at = { exercise: legExtension, weight: 150, reps: 12, units: 'lb' as const };
    expect(weightSlip({ ...at, history, profile: lightFemale })).toBeNull();
    expect(weightSlip({ ...at, history: [], profile: lightFemale })).not.toBeNull();
  });

  it('leaves a correction of a saved bodyweight that is itself out of range', () => {
    expect(bodyweightSlip(180, 18, 'lb')).toBeNull();
    expect(bodyweightSlip(180, 120, 'lb')).not.toBeNull();
  });
});

describe('weightSlip after the fourth pass of item 40', () => {
  const lateral = requireExercise('lateral-raise');
  const legPress = requireExercise('leg-press');

  it('reads the logged best and the typed set alike, up to thirty reps', () => {
    const history = [record(7, lateral.id, [[30, 15, 1]], [12, 20], 1)];
    const at = { exercise: lateral, reps: 30, units: 'lb' as const, history };
    // 20 × 30 against 15 × 30, read alike, is a third more: no slip.
    expect(weightSlip({ ...at, weight: 20 })).toBeNull();
    expect(weightSlip({ ...at, weight: 30 })?.text).toBe(
      '30 lb per hand × 30 is far above anything logged for Lateral Raise (best 15 lb per hand × 30).',
    );
  });

  it('lets the set being corrected spare a question, never make one: 6 corrected to 65', () => {
    const at = { exercise: dumbbell, reps: 10, units: 'lb' as const, history: [], profile };
    // Logged at 6, a digit short, and corrected: judged as if typed new.
    expect(weightSlip({ ...at, weight: 65, editing: { weight: 6, reps: 10 } })).toBeNull();
    // As today's evidence it would hold 65 to the 6: the edit is no evidence.
    expect(weightSlip({ ...at, weight: 65, today: [{ weight: 6, reps: 10 }] })?.text).toBe(
      '65 lb per hand × 10 is far above anything logged for Dumbbell Bench Press (best 6 lb per hand × 10).',
    );
    // It still spares one: fewer reps at the weight kept.
    expect(weightSlip({ ...at, weight: 6, reps: 9, editing: { weight: 6, reps: 10 } })).toBeNull();
    // And an upward slip in a correction is still asked about.
    expect(weightSlip({ ...at, weight: 1850, editing: { weight: 185, reps: 10 } })?.field).toBe(
      'weight',
    );
  });

  it("asks about a heavy beginner's 10x slip that reads 3.6 times the body's estimate", () => {
    const heavy = { ...profile, bodyweight: 250, experience: 'beginner' as const };
    const at = { exercise: legPress, reps: 10, units: 'lb' as const, history: [], profile: heavy };
    expect(weightSlip({ ...at, weight: 90 })).toBeNull();
    expect(weightSlip({ ...at, weight: 900 })?.text).toMatch(
      /^900 lb × 10 is far above what your bodyweight and experience suggest for Leg Press/,
    );
  });
});

describe('weightSlip after the fifth pass of item 40', () => {
  const curl = requireExercise('barbell-curl');
  const lightFemale = {
    ...profile,
    bodyweight: 120,
    experience: 'beginner' as const,
    sex: 'female' as const,
  };

  it("never questions the app's own target: a light beginner's empty bar on a curl", () => {
    const at = {
      exercise: curl,
      reps: 12,
      units: 'lb' as const,
      history: [],
      profile: lightFemale,
    };
    // The bar reads more than three and a half times what the body suggests for a curl.
    expect(weightSlip({ ...at, weight: 50 })).not.toBeNull();
    // As the set's own target, and a little over it, it is no slip; ten times it is.
    expect(weightSlip({ ...at, weight: 45, target: 45 })).toBeNull();
    expect(weightSlip({ ...at, weight: 50, target: 45 })).toBeNull();
    expect(weightSlip({ ...at, weight: 450, target: 45 })?.text).toMatch(
      /^450 lb × 12 is far above what your bodyweight and experience suggest for Barbell Curl/,
    );
  });

  it('never questions the empty bar by an estimate: a recent set on the max sheet', () => {
    const at = {
      exercise: curl,
      reps: 12,
      units: 'lb' as const,
      history: [],
      profile: lightFemale,
    };
    expect(weightSlip({ ...at, weight: 45 })).toBeNull();
  });

  it('spares a correction up to one and a half times the set it corrects', () => {
    const history = [record(7, bench.id, [[5, 100, 1]])];
    const at = {
      exercise: bench,
      units: 'lb' as const,
      history,
      editing: { weight: 200, reps: 5 },
    };
    // Kept at 200 × 5, corrected by a rep, a step, or to a lighter reading: not asked again.
    expect(weightSlip({ ...at, weight: 200, reps: 6 })).toBeNull();
    expect(weightSlip({ ...at, weight: 205, reps: 5 })).toBeNull();
    expect(weightSlip({ ...at, weight: 180, reps: 8 })).toBeNull();
    // Far past it, the correction is asked about against the lift's best.
    expect(weightSlip({ ...at, weight: 400, reps: 5 })?.text).toBe(
      '400 lb × 5 is far above anything logged for Barbell Bench Press (best 100 lb × 5).',
    );
  });

  it('spares the absolute checks only at the weight it corrects', () => {
    // A kept 1850 corrected to 1350: asked about as any 1350 is.
    expect(
      weightSlip({
        exercise: bench,
        weight: 1350,
        reps: 5,
        units: 'lb',
        history: [],
        editing: { weight: 1850, reps: 5 },
      })?.text,
    ).toBe('1350 lb is more than 1000 lb: more than almost anyone loads on Barbell Bench Press.');
    // A kept 13 corrected to 35: under the empty bar, asked about.
    expect(
      weightSlip({
        exercise: bench,
        weight: 35,
        reps: 5,
        units: 'lb',
        history: [],
        editing: { weight: 13, reps: 5 },
      })?.text,
    ).toBe('35 lb is less than the empty bar (45 lb) for Barbell Bench Press.');
    // At its own weight it spares them: fewer reps on a kept 1850.
    expect(
      weightSlip({
        exercise: bench,
        weight: 1850,
        reps: 4,
        units: 'lb',
        history: [],
        editing: { weight: 1850, reps: 5 },
      }),
    ).toBeNull();
  });
});

describe('weightSlip after the sixth pass of item 40', () => {
  it('asks nothing by an estimate when there is none: the target only raises one', () => {
    // No bodyweight saved and nothing related logged: no estimate to compare with.
    const plain = { experience: 'intermediate' as const, units: 'lb' as const };
    const at = { exercise: bench, reps: 8, units: 'lb' as const, history: [], profile: plain };
    expect(weightSlip({ ...at, weight: 185, target: 45 })).toBeNull();
    expect(weightSlip({ ...at, weight: 185 })).toBeNull();
  });
});

describe('weightSlip after the seventh pass of item 40', () => {
  const curl = requireExercise('barbell-curl');
  /** Bench pressed 225 × 5 three days back; no bodyweight saved, no curl logged. */
  const benched = [record(3, 'barbell-bench-press', [[5, 225, 1]])];
  const plain = { experience: 'intermediate' as const, units: 'lb' as const };
  const others = estimateFromOtherLifts(curl, benched, RECORD_NOW, 'lb')!.e1rm;

  it("asks about a tenfold slip by what the lifter's other lifts suggest, as the first target reads them", () => {
    const at = { exercise: curl, reps: 12, units: 'lb' as const, history: benched, profile: plain };
    const slip = weightSlip({ ...at, weight: 650, target: 65, now: RECORD_NOW });
    expect(slip?.text).toBe(
      `650 lb × 12 is far above what your other lifts suggest for Barbell Curl (a max of about ${Math.round(others)} lb).`,
    );
    // The target itself, and a set well past it, are no slip.
    expect(weightSlip({ ...at, weight: 65, target: 65, now: RECORD_NOW })).toBeNull();
    expect(weightSlip({ ...at, weight: 95, target: 65, now: RECORD_NOW })).toBeNull();
    // A max typed on the max sheet is read the same way.
    expect(weightSlip({ ...at, weight: 840, reps: 1, max: true, now: RECORD_NOW })?.text).toMatch(
      /what your other lifts suggest for Barbell Curl/,
    );
  });

  it('takes an estimate that rounds to nothing as none: never "a max of about 0"', () => {
    const lateral = requireExercise('lateral-raise');
    const tiny = {
      bodyweight: 18,
      experience: 'beginner' as const,
      sex: 'female' as const,
      age: 70,
      units: 'lb' as const,
    };
    expect(Math.round(estimateStartingMax(lateral, tiny)?.e1rm ?? 0)).toBe(0);
    expect(
      weightSlip({
        exercise: lateral,
        weight: 20,
        reps: 12,
        units: 'lb',
        history: [],
        profile: tiny,
      }),
    ).toBeNull();
    // Nor from other lifts: a bench set logged at 1 lb by mistake says a lateral raise max of
    // nearly nothing, which is no estimate either.
    const slip = [record(2, 'barbell-bench-press', [[1, 1, 2]])];
    const other = estimateFromOtherLifts(lateral, slip, RECORD_NOW, 'lb', null, true)?.e1rm ?? 0;
    expect(other).toBeGreaterThan(0);
    expect(Math.round(other)).toBe(0);
    expect(
      weightSlip({
        exercise: lateral,
        weight: 20,
        reps: 12,
        units: 'lb',
        history: slip,
        now: RECORD_NOW,
      }),
    ).toBeNull();
  });
});

describe('weightSlip after the eighth pass of item 40', () => {
  const legPress = requireExercise('leg-press');
  const plain = { experience: 'intermediate' as const, units: 'lb' as const };

  it('reads the other lifts at their best as a ceiling: a light day on one does not lower it', () => {
    const history = [
      record(20, 'barbell-bench-press', [[5, 95, 2]]),
      record(9, 'barbell-bench-press', [[5, 95, 2]]),
      record(2, 'barbell-bench-press', [[10, 45, 4]]),
    ];
    const at = { exercise: legPress, reps: 10, units: 'lb' as const, history, profile: plain };
    expect(weightSlip({ ...at, weight: 450, now: RECORD_NOW })).toBeNull();
    // Without the light day the same ceiling stands.
    expect(estimateFromOtherLifts(legPress, history, RECORD_NOW, 'lb', null, true)!.e1rm).toBe(
      estimateFromOtherLifts(legPress, history.slice(0, 2), RECORD_NOW, 'lb', null, true)!.e1rm,
    );
  });

  it('takes no estimate from a bodyweight kept out of the range', () => {
    const lateral = requireExercise('lateral-raise');
    // 18 lb kept: the body's table would say a max of about 2 lb, which no question should read.
    const tiny = { bodyweight: 18, experience: 'intermediate' as const, units: 'lb' as const };
    expect(Math.round(estimateStartingMax(lateral, tiny)?.e1rm ?? 0)).toBeGreaterThan(0);
    expect(
      weightSlip({
        exercise: lateral,
        weight: 20,
        reps: 12,
        units: 'lb',
        history: [],
        profile: tiny,
      }),
    ).toBeNull();
  });
});

describe("the other lifts' estimate after the eighth pass of item 40", () => {
  const legPress = requireExercise('leg-press');
  const logs = [
    record(20, 'barbell-bench-press', [[5, 205, 2]]),
    record(10, 'barbell-bench-press', [[5, 215, 2]]),
    record(3, 'barbell-bench-press', [[5, 225, 2]]),
  ];
  const maxEntered = (enteredAt: string) => ({
    maxes: { 'barbell-bench-press': { e1rm: 95, units: 'lb' as const, enteredAt, from: null } },
    prompts: {},
  });

  it("lets a max entered before a lift's logs give way to them for a first target", () => {
    const old = maxEntered('2026-08-01T12:00:00.000Z');
    const fromLogs = estimateFromOtherLifts(legPress, logs, RECORD_NOW, 'lb')!.e1rm;
    expect(estimateFromOtherLifts(legPress, logs, RECORD_NOW, 'lb', old as never)!.e1rm).toBe(
      fromLogs,
    );
    // Entered after them, it stands.
    const fresh = maxEntered('2026-09-09T12:00:00.000Z');
    expect(
      estimateFromOtherLifts(legPress, logs, RECORD_NOW, 'lb', fresh as never)!.e1rm,
    ).toBeLessThan(fromLogs);
  });

  it('reads the higher of a max entered and the logs as a ceiling', () => {
    const fresh = maxEntered('2026-09-09T12:00:00.000Z');
    expect(
      estimateFromOtherLifts(legPress, logs, RECORD_NOW, 'lb', fresh as never, true)!.e1rm,
    ).toBe(estimateFromOtherLifts(legPress, logs, RECORD_NOW, 'lb', null, true)!.e1rm);
  });
});

describe("the other lifts' estimate after the ninth pass of item 40", () => {
  const legPress = requireExercise('leg-press');
  const curl = requireExercise('barbell-curl');
  const maxOf = (e1rm: number, enteredAt: string) =>
    ({
      maxes: { 'barbell-bench-press': { e1rm, units: 'lb' as const, enteredAt, from: null } },
      prompts: {},
    }) as never;

  it('reads a long set every rep up to thirty as a ceiling: a tenfold slip is still asked', () => {
    // Weekly fives for three months, and one set of a hundred reps ninety days ago.
    const weeks = Array.from({ length: 12 }, (_, week) =>
      record(week * 7 + 1, 'barbell-bench-press', [[5, 135, 2]]),
    );
    const history = [...weeks, record(90, 'barbell-bench-press', [[100, 135, 0]])];
    const ceiling = estimateFromOtherLifts(curl, history, RECORD_NOW, 'lb', null, true)!;
    expect(ceiling.evidence).toContain('(about 270 lb max)');
    expect(
      weightSlip({
        exercise: curl,
        weight: 450,
        reps: 12,
        units: 'lb',
        history,
        profile,
        now: RECORD_NOW,
      })?.text,
    ).toContain('far above what');
  });

  it('lets a max older than the 180 days go, and weighs one by its own age', () => {
    // Logs aged out, and a max older than them: nothing now, not a max entered today.
    const aged = [record(200, 'barbell-bench-press', [[5, 225, 2]])];
    expect(
      estimateFromOtherLifts(
        legPress,
        aged,
        RECORD_NOW,
        'lb',
        maxOf(315, '2025-08-06T12:00:00.000Z'),
      ),
    ).toBeNull();
    // A max entered a hundred days ago weighs as a lift done then, beside a squat of this week.
    const squatDay = [record(5, 'back-squat', [[5, 275, 2]])];
    const fresh = estimateFromOtherLifts(
      legPress,
      squatDay,
      RECORD_NOW,
      'lb',
      maxOf(315, '2026-09-10T11:00:00.000Z'),
    )!.e1rm;
    const months = estimateFromOtherLifts(
      legPress,
      squatDay,
      RECORD_NOW,
      'lb',
      maxOf(315, '2026-06-02T12:00:00.000Z'),
    )!.e1rm;
    const squatOnly = estimateFromOtherLifts(legPress, squatDay, RECORD_NOW, 'lb')!.e1rm;
    // The older the max, the nearer the squat alone.
    expect(Math.abs(months - squatOnly)).toBeLessThan(Math.abs(fresh - squatOnly));
  });

  it('reads a max of no readable date as nothing', () => {
    const logs = [record(3, 'barbell-bench-press', [[5, 225, 2]])];
    const fromLogs = estimateFromOtherLifts(legPress, logs, RECORD_NOW, 'lb')!.e1rm;
    for (const enteredAt of ['', 'yesterday']) {
      expect(
        estimateFromOtherLifts(legPress, logs, RECORD_NOW, 'lb', maxOf(95, enteredAt))!.e1rm,
      ).toBe(fromLogs);
      expect(
        estimateFromOtherLifts(legPress, [], RECORD_NOW, 'lb', maxOf(95, enteredAt)),
      ).toBeNull();
    }
  });

  it('counts a max entered after the lift began that day, as its own target reads one', () => {
    // The workout ran 10:00 to 10:45; the bench's sets were logged at 10:05 and 10:08.
    const base = record(0, 'barbell-bench-press', [
      [5, 225, 2],
      [5, 225, 2],
    ]);
    const timed = {
      ...base,
      startedAt: '2026-09-10T10:00:00.000Z',
      completedAt: '2026-09-10T10:45:00.000Z',
      entries: base.entries.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set, index) => ({
          ...set,
          loggedAt: index === 0 ? '2026-09-10T10:05:00.000Z' : '2026-09-10T10:08:00.000Z',
        })),
      })),
    };
    const fromLogs = estimateFromOtherLifts(legPress, [timed], RECORD_NOW, 'lb')!.e1rm;
    // Entered at 10:15, after the lift began: it stands.
    expect(
      estimateFromOtherLifts(
        legPress,
        [timed],
        RECORD_NOW,
        'lb',
        maxOf(275, '2026-09-10T10:15:00.000Z'),
      )!.e1rm,
    ).toBeGreaterThan(fromLogs);
    // Entered at 9:55, before it: the logs win.
    expect(
      estimateFromOtherLifts(
        legPress,
        [timed],
        RECORD_NOW,
        'lb',
        maxOf(275, '2026-09-10T09:55:00.000Z'),
      )!.e1rm,
    ).toBe(fromLogs);
    // Sets of no time are read at the workout's end, as the lift's own target reads them.
    const untimed = { ...timed, entries: base.entries };
    expect(
      estimateFromOtherLifts(
        legPress,
        [untimed],
        RECORD_NOW,
        'lb',
        maxOf(275, '2026-09-10T10:15:00.000Z'),
      )!.e1rm,
    ).toBe(fromLogs);
  });

  it('reads the lift as begun at its first set of any kind, a warm-up too', () => {
    const base = record(0, 'barbell-bench-press', [[5, 225, 2]]);
    const entry = base.entries[0]!;
    const warmed = {
      ...base,
      startedAt: '2026-09-10T10:00:00.000Z',
      completedAt: '2026-09-10T10:45:00.000Z',
      entries: [
        {
          ...entry,
          sets: [
            {
              ...entry.sets[0]!,
              kind: 'warmup' as const,
              reps: 8,
              weight: 95,
              rir: null,
              loggedAt: '2026-09-10T10:02:00.000Z',
            },
            { ...entry.sets[0]!, setIndex: 1, loggedAt: '2026-09-10T10:05:00.000Z' },
          ],
        },
      ],
    };
    const fromLogs = estimateFromOtherLifts(legPress, [warmed], RECORD_NOW, 'lb')!.e1rm;
    // Entered at 10:03, after the warm-up, before the first working set: it stands.
    expect(
      estimateFromOtherLifts(
        legPress,
        [warmed],
        RECORD_NOW,
        'lb',
        maxOf(275, '2026-09-10T10:03:00.000Z'),
      )!.e1rm,
    ).toBeGreaterThan(fromLogs);
  });
});

describe("the other lifts' estimate after the ninth pass of item 40: two workouts in a day", () => {
  const legPress = requireExercise('leg-press');
  /** A workout of one bench set, its set logged at `logged`. */
  const day = (start: string, end: string, logged: string, weight: number) => {
    const base = record(1, 'barbell-bench-press', [[5, weight, 2]]);
    return {
      ...base,
      id: `w-${start}`,
      startedAt: start,
      completedAt: end,
      entries: base.entries.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set) => ({ ...set, loggedAt: logged })),
      })),
    };
  };
  const morning = day(
    '2026-09-09T07:00:00.000Z',
    '2026-09-09T07:45:00.000Z',
    '2026-09-09T07:05:00.000Z',
    225,
  );
  const evening = day(
    '2026-09-09T18:00:00.000Z',
    '2026-09-09T18:45:00.000Z',
    '2026-09-09T18:05:00.000Z',
    185,
  );
  const noon = {
    maxes: {
      'barbell-bench-press': {
        e1rm: 315,
        units: 'lb' as const,
        enteredAt: '2026-09-09T12:00:00.000Z',
        from: null,
      },
    },
    prompts: {},
  } as never;

  it('lets a max entered between them give way to the second, whichever is read first', () => {
    for (const history of [
      [morning, evening],
      [evening, morning],
    ]) {
      const fromLogs = estimateFromOtherLifts(legPress, history, RECORD_NOW, 'lb')!.e1rm;
      expect(estimateFromOtherLifts(legPress, history, RECORD_NOW, 'lb', noon)!.e1rm).toBe(
        fromLogs,
      );
    }
  });
});

describe('weightSlip after the ninth pass of item 40', () => {
  it('judges no weight added to the body against a bodyweight kept out of the range', () => {
    const tiny = { bodyweight: 18, experience: 'intermediate' as const, units: 'lb' as const };
    const added = { exercise: chinUp, reps: 8, units: 'lb' as const, history: [] };
    expect(weightSlip({ ...added, weight: 20, profile: tiny })).toBeNull();
    // A bodyweight in the range still asks.
    expect(weightSlip({ ...added, weight: 180, profile })?.text).toContain('as much as you weigh');
  });
});

describe("the other lifts' estimate after the tenth pass of item 40", () => {
  const legPress = requireExercise('leg-press');
  const maxOf = (e1rm: number, enteredAt: string) =>
    ({
      maxes: { 'barbell-bench-press': { e1rm, units: 'lb' as const, enteredAt, from: null } },
      prompts: {},
    }) as never;
  const ago = (days: number) => new Date(Date.parse(RECORD_NOW) - days * 86_400_000).toISOString();

  it('never lowers the ceiling for a max above the logs, however old it is', () => {
    const pecDeck = requireExercise('pec-deck');
    const history = [
      record(1, 'barbell-bench-press', [[5, 225, 2]]),
      record(1, 'back-squat', [[5, 135, 2]]),
    ];
    const none = estimateFromOtherLifts(pecDeck, history, RECORD_NOW, 'lb', null, true)!.e1rm;
    const old = estimateFromOtherLifts(
      pecDeck,
      history,
      RECORD_NOW,
      'lb',
      maxOf(275, ago(150)),
      true,
    )!.e1rm;
    expect(old).toBeGreaterThan(none);
    // So a set the logs alone allow is not asked about for the old max.
    const at = { exercise: pecDeck, weight: 275, reps: 10, units: 'lb' as const, history };
    expect(weightSlip({ ...at, now: RECORD_NOW })).toBeNull();
    expect(weightSlip({ ...at, now: RECORD_NOW, maxes: maxOf(275, ago(150)) })).toBeNull();
  });

  it('reads a long set every rep up to thirty for a first target, a single as lifted', () => {
    const dumbbell = requireExercise('dumbbell-bench-press');
    const long = [
      record(7, 'barbell-bench-press', [[5, 225, 2]]),
      record(1, 'barbell-bench-press', [[95, 100, 0]]),
    ];
    expect(estimateFromOtherLifts(dumbbell, long, RECORD_NOW, 'lb')!.evidence).toContain(
      '(about 200 lb max)',
    );
    const single = [record(1, 'barbell-bench-press', [[1, 225, 0]])];
    expect(estimateFromOtherLifts(dumbbell, single, RECORD_NOW, 'lb')!.evidence).toContain(
      '(about 225 lb max)',
    );
  });

  it('reads a max dated ahead as no max, beyond a day of leeway', () => {
    const logs = [record(3, 'barbell-bench-press', [[5, 225, 2]])];
    const fromLogs = estimateFromOtherLifts(legPress, logs, RECORD_NOW, 'lb')!.e1rm;
    expect(
      estimateFromOtherLifts(
        legPress,
        logs,
        RECORD_NOW,
        'lb',
        maxOf(95, '2027-09-01T12:00:00.000Z'),
      )!.e1rm,
    ).toBe(fromLogs);
    // An hour ahead is a clock running ahead: the max stands.
    expect(
      estimateFromOtherLifts(
        legPress,
        logs,
        RECORD_NOW,
        'lb',
        maxOf(95, '2026-09-10T13:00:00.000Z'),
      )!.e1rm,
    ).toBeLessThan(fromLogs);
  });

  it("weighs a lift's best set, as a ceiling, by its newest session's age", () => {
    const pecDeck = requireExercise('pec-deck');
    const squat = record(5, 'back-squat', [[5, 275, 2]]);
    const longAgo = [
      record(60, 'barbell-bench-press', [[5, 225, 2]]),
      record(5, 'barbell-bench-press', [[5, 135, 2]]),
      squat,
    ];
    const lately = [record(5, 'barbell-bench-press', [[5, 225, 2]]), squat];
    expect(estimateFromOtherLifts(pecDeck, longAgo, RECORD_NOW, 'lb', null, true)!.e1rm).toBe(
      estimateFromOtherLifts(pecDeck, lately, RECORD_NOW, 'lb', null, true)!.e1rm,
    );
  });

  it('reads a set logged at no weight as no max', () => {
    const cableFly = requireExercise('cable-fly');
    const history = [
      record(2, 'barbell-bench-press', [[5, 225, 2]]),
      record(1, 'back-squat', [[5, 275, 2]]),
    ];
    const withZero = [...history, record(1, 'pec-deck', [[10, 0, 2]])];
    expect(estimateFromOtherLifts(cableFly, withZero, RECORD_NOW, 'lb', null, true)!.e1rm).toBe(
      estimateFromOtherLifts(cableFly, history, RECORD_NOW, 'lb', null, true)!.e1rm,
    );
    expect(estimateFromOtherLifts(cableFly, withZero, RECORD_NOW, 'lb')!.e1rm).toBe(
      estimateFromOtherLifts(cableFly, history, RECORD_NOW, 'lb')!.e1rm,
    );
  });

  it("reads when the lift began in its newest workout: an older one's late set times never move it", () => {
    const timed = (days: number, start: string, end: string, logged: string) => {
      const base = record(days, 'barbell-bench-press', [[5, 225, 2]]);
      return {
        ...base,
        startedAt: start,
        completedAt: end,
        entries: base.entries.map((entry) => ({
          ...entry,
          sets: entry.sets.map((set) => ({ ...set, loggedAt: logged })),
        })),
      };
    };
    // The newest workout's bench began at 10:05; an older one's sets carry a clock set ahead, 11:00.
    const newest = timed(
      0,
      '2026-09-10T10:00:00.000Z',
      '2026-09-10T10:45:00.000Z',
      '2026-09-10T10:05:00.000Z',
    );
    const skewed = timed(
      3,
      '2026-09-07T10:00:00.000Z',
      '2026-09-07T10:45:00.000Z',
      '2026-09-10T11:00:00.000Z',
    );
    const noon = maxOf(275, '2026-09-10T10:30:00.000Z');
    const alone = estimateFromOtherLifts(legPress, [newest], RECORD_NOW, 'lb', noon)!.e1rm;
    expect(alone).toBeGreaterThan(
      estimateFromOtherLifts(legPress, [newest], RECORD_NOW, 'lb')!.e1rm,
    );
    for (const history of [
      [newest, skewed],
      [skewed, newest],
    ]) {
      expect(
        estimateFromOtherLifts(legPress, history, RECORD_NOW, 'lb', noon)!.e1rm,
      ).toBeGreaterThan(estimateFromOtherLifts(legPress, history, RECORD_NOW, 'lb')!.e1rm);
    }
  });
});

describe('weightSlip after the eleventh pass of item 40', () => {
  it('never asks more for a max entered: a fresh one over old logs, or one on a lift never logged', () => {
    const legPress = requireExercise('leg-press');
    const history = [
      record(100, 'barbell-bench-press', [[5, 135, 2]]),
      record(2, 'back-squat', [[5, 405, 2]]),
    ];
    const maxOn = (exerciseId: string, e1rm: number) =>
      ({
        maxes: { [exerciseId]: { e1rm, units: 'lb' as const, enteredAt: RECORD_NOW, from: null } },
        prompts: {},
      }) as never;
    const at = {
      exercise: legPress,
      weight: 1870,
      reps: 10,
      units: 'lb' as const,
      history,
      now: RECORD_NOW,
    };
    expect(weightSlip(at)).toBeNull();
    expect(weightSlip({ ...at, maxes: maxOn('barbell-bench-press', 160) })).toBeNull();
    expect(weightSlip({ ...at, maxes: maxOn('overhead-press', 95) })).toBeNull();
  });
});
