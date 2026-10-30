import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../recalibration/types';
import { allEntries, isStopped, type GeneratedWorkout } from '../workout/types';
import { generateWorkout, isMainLiftLine } from './generate';
import {
  at,
  describeWorkout,
  directSets,
  gym,
  profileOf,
  session,
  working,
} from '../../test/clockDays';

/**
 * Maintenance 31, the seventh review of round M: a catch-up keeps its slots as laid out with the
 * plan, so a rebuild around what it keeps fills the same slots. A lift kept stays in its own slot; a
 * swap the lifter made holds it, the muscles it misses waiting; a stand-in skipped brings no sets
 * back; a muscle a kept lift misses takes a slot of its own, right after that lift's (the eighth
 * review). Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const exercises = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => entry.exerciseId);
const behind = (
  ...muscles: (
    'quads' | 'glutes' | 'chest' | 'triceps' | 'lats' | 'biceps' | 'calves' | 'hamstrings'
  )[]
): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const })),
  sitOut: [],
});
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
/** A barbell, a rack and a bench: the back squat, swapped for weeks for the front squat, is out. */
const [rack] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['barbell', 'squat-rack', 'flat-bench'] },
  at(1),
) as [LocationProfile];
const frontForBack = [{ from: 'back-squat', to: 'front-squat', setAt: at(1), until: at(30) }];

const plan = (spec: CatchUpSpec, location: LocationProfile | undefined, extra: object = {}) =>
  generateWorkout({
    profile: profileOf(),
    location,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec, ...extra },
  });

/** A change to the day's plan, as the store asks one. */
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  spec: CatchUpSpec,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationRequest => ({
  trigger,
  workout,
  completed: emptyCompleted(),
  lockedEntryIds: [],
  currentEntryId: null,
  duration: 'default',
  profile: profileOf(),
  location: gym,
  loading: { missingPlates: [] },
  history: records,
  constraints: { ...emptyConstraints(), catchUp: spec },
  reason: 'test',
  timestamp: NOW,
  ...options,
});

/** The plan with the lifter's swap of one entry for an exercise, and the constraints it leaves. */
const swapped = (
  workout: GeneratedWorkout,
  spec: CatchUpSpec,
  entryId: string,
  exerciseId: string,
  options: Partial<RecalibrationRequest> = {},
) =>
  succeeded(recalibrate(request({ type: 'replace', entryId, exerciseId }, workout, spec, options)));

describe('a lifter’s swap that misses its slot’s muscle holds the slot, whatever its movement', () => {
  // Decided: a lifter's swap that misses its slot's muscle holds the slot, and the muscle waits.
  // The sixth pass keeps a kept lift in its slot only where the slot is of the lift's movement: a
  // swap to a lift of another movement is "moved" by the relay, back to its own number (flagged as
  // relayed, so the extra slot's exception is lost) or to none (and its slot is filled again).

  it('a hip thrust for the back squat the quads and the glutes share: "30 min" adds no lift', () => {
    const spec = behind('quads', 'glutes');
    const before = plan(spec, gym);
    expect(exercises(before), lifts(before)).toEqual(['back-squat']);
    const swap = swapped(before, spec, allEntries(before.blocks)[0]!.id, 'hip-thrust');
    // The swap holds the slot: the quads, which the hip thrust misses, wait.
    expect(exercises(swap.workout)).toEqual(['hip-thrust']);
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 30 }, swap.workout, spec, {
          constraints: swap.constraints,
        }),
      ),
    );
    // Before: "Recalibrated to 30 min: 1 exercise added", a front squat for the quads.
    expect(exercises(shorter.workout), shorter.summary.headline).toEqual(['hip-thrust']);
  });

  it('... and "Make it easier" adds none', () => {
    const spec = behind('quads', 'glutes');
    const before = plan(spec, gym);
    const swap = swapped(before, spec, allEntries(before.blocks)[0]!.id, 'hip-thrust');
    const easier = succeeded(
      recalibrate(
        request({ type: 'intensity', direction: 'easier' }, swap.workout, spec, {
          constraints: swap.constraints,
        }),
      ),
    );
    // Before: "Rest of the workout made easier: 1 exercise added".
    expect(exercises(easier.workout), easier.summary.headline).toEqual(['hip-thrust']);
    expect(directSets(easier.workout, 'quads'), lifts(easier.workout)).toBe(0);
  });

  it('a leg extension for the glutes’ back squat keeps its slot: the back squat stays out', () => {
    // The leg extension works none of the day's muscles, as the sixth review's front squat did, but
    // is of another movement than the squat's slot.
    const spec = behind('glutes');
    const before = plan(spec, gym);
    expect(exercises(before), lifts(before)).toEqual(['back-squat']);
    const swap = swapped(before, spec, allEntries(before.blocks)[0]!.id, 'leg-extension');
    expect(exercises(swap.workout)).toEqual(['leg-extension']);
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 30 }, swap.workout, spec, {
          constraints: swap.constraints,
        }),
      ),
    );
    // Before: "back-squat x3; leg-extension x3", the leg extension with no slot and the back squat,
    // swapped away, back in its place.
    expect(exercises(shorter.workout), shorter.summary.headline).toEqual(['leg-extension']);
  });

  it('a swap made in an extra slot holds it: the lift swapped away does not come back', () => {
    // At the rack the quads take the front squat, pinned; at the gym the glutes take a slot of their
    // own after the squat's, the dumbbell Romanian deadlift, which the lifter swaps for a leg curl.
    const spec = behind('quads', 'glutes');
    const atRack = plan(spec, rack, { swaps: frontForBack });
    const front = allEntries(atRack.blocks).find((entry) => entry.exerciseId === 'front-squat')!;
    const pinned = structuredClone(atRack);
    const own = allEntries(pinned.blocks).find((entry) => entry.id === front.id)!;
    own.pinned = true;
    own.locked = true;
    const atGym = succeeded(
      recalibrate(request({ type: 'location' }, pinned, spec, { swaps: frontForBack })),
    );
    const extra = allEntries(atGym.workout.blocks).find((entry) => entry.id !== front.id);
    expect(extra?.exerciseId, lifts(atGym.workout)).toBe('dumbbell-romanian-deadlift');
    const swap = swapped(atGym.workout, spec, extra!.id, 'leg-curl', {
      swaps: frontForBack,
      constraints: atGym.constraints,
    });
    expect(exercises(swap.workout)).toEqual(['front-squat', 'leg-curl']);
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 30 }, swap.workout, spec, {
          swaps: frontForBack,
          constraints: swap.constraints,
        }),
      ),
    );
    // Before: "front-squat x3; dumbbell-romanian-deadlift x3; leg-curl x3".
    expect(exercises(shorter.workout), shorter.summary.headline).toEqual([
      'front-squat',
      'leg-curl',
    ]);
  });
});

describe('a stand-in skipped on a catch-up brings no sets back', () => {
  // As on the usual plan (recalibrate.swapStarted.test.ts, "keeps the swapped-out lift stopped when
  // the stand-in is skipped, and brings no sets back"): skipping the lift that carried a stopped
  // one's sets skips those sets too. On a catch-up the sixth pass's extra slots bring them back: the
  // slot's lift is stopped and owes nothing, so no lift carries on there and every muscle still
  // short takes a slot of its own.

  /** The first lift begun, one set done, swapped for another, and the stand-in skipped. */
  function skippedStandIn(spec: CatchUpSpec, to: string) {
    const before = plan(spec, gym);
    const [lift] = allEntries(before.blocks);
    const set = working(lift!)[0]!;
    const completed: CompletedWork = {
      startedAt: NOW,
      elapsedSeconds: 300,
      currentEntryId: lift!.id,
      sets: [
        {
          entryId: lift!.id,
          exerciseId: lift!.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 8,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const swap = swapped(before, spec, lift!.id, to, { completed });
    const stand = allEntries(swap.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.slot === lift!.slot,
    );
    expect(stand?.exerciseId, lifts(swap.workout)).toBe(to);
    const idle: CompletedWork = { ...completed, currentEntryId: null };
    const skipped = succeeded(
      recalibrate(
        request({ type: 'skip', entryId: stand!.id }, swap.workout, spec, {
          completed: idle,
          constraints: swap.constraints,
        }),
      ),
    );
    expect(exercises(skipped.workout)).toEqual([lift!.exerciseId]);
    return { lift: lift!, idle, skipped };
  }

  it.each([
    ['"30 min"', { type: 'duration', choice: 30 } as RecalibrationTrigger],
    ['"Make it easier"', { type: 'intensity', direction: 'easier' } as RecalibrationTrigger],
    ['a resume after 25 minutes away', { type: 'resume', awaySeconds: 25 * 60 } as const],
  ])('the chest’s bench press stays alone through %s', (_, trigger) => {
    const spec = behind('chest');
    const { lift, idle, skipped } = skippedStandIn(spec, 'dumbbell-bench-press');
    const later = succeeded(
      recalibrate(
        request(trigger, skipped.workout, spec, {
          completed: idle,
          constraints: skipped.constraints,
        }),
      ),
    );
    // Before: "barbell-bench-press x1; machine-chest-press x2", the skipped sets back.
    const pressing = allEntries(later.workout.blocks).filter(
      (entry) => requireExercise(entry.exerciseId).movementPattern === 'horizontal-push',
    );
    expect(
      pressing.map((entry) => entry.id),
      later.summary.headline,
    ).toEqual([lift.id]);
    expect(directSets(later.workout, 'chest'), lifts(later.workout)).toBe(1);
  });

  it('the quads’ and the glutes’ back squat stays alone through "30 min"', () => {
    const spec = behind('quads', 'glutes');
    const { lift, idle, skipped } = skippedStandIn(spec, 'leg-press');
    const later = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 30 }, skipped.workout, spec, {
          completed: idle,
          constraints: skipped.constraints,
        }),
      ),
    );
    // Before: "back-squat x1; hack-squat x2; dumbbell-romanian-deadlift x2".
    expect(
      allEntries(later.workout.blocks).map((entry) => entry.id),
      `${later.summary.headline} ${lifts(later.workout)}`,
    ).toEqual([lift.id]);
  });
});

describe('a pinned lift in a slot of its own takes the day’s settings', () => {
  // The sixth pass clears the slot of a kept group the relay cannot place. A pinned lift with no
  // slot reads, to the rebuild, as one the coach added (`settleKept`): "Make it easier" or "harder"
  // and a check-in leave it as it was, where every other pinned lift takes them (Maintenance 24). A
  // pinned lift in an extra slot always loses its slot at the next rebuild: its muscle's own slot
  // is the kept lift's.

  it('a pinned lift in an extra slot takes "Make it easier" as the pinned front squat does', () => {
    const spec = behind('quads', 'glutes');
    const atRack = plan(spec, rack, { swaps: frontForBack });
    const pin = (workout: GeneratedWorkout, id: string): GeneratedWorkout => {
      const copy = structuredClone(workout);
      const entry = allEntries(copy.blocks).find((candidate) => candidate.id === id)!;
      entry.pinned = true;
      entry.locked = true;
      return copy;
    };
    const front = allEntries(atRack.blocks).find((entry) => entry.exerciseId === 'front-squat')!;
    const atGym = succeeded(
      recalibrate(
        request({ type: 'location' }, pin(atRack, front.id), spec, { swaps: frontForBack }),
      ),
    );
    const extra = allEntries(atGym.workout.blocks).find((entry) => entry.id !== front.id)!;
    expect(extra.exerciseId, lifts(atGym.workout)).toBe('dumbbell-romanian-deadlift');
    // Both pinned; a change of length that changes nothing lays the slots out again.
    const longer = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, pin(atGym.workout, extra.id), spec, {
          swaps: frontForBack,
          constraints: atGym.constraints,
        }),
      ),
    );
    const before = allEntries(longer.workout.blocks).find((entry) => entry.id === extra.id)!;
    expect(working(before).map((set) => set.targetRir)).toEqual([1, 1, 1]);
    const easier = succeeded(
      recalibrate(
        request({ type: 'intensity', direction: 'easier' }, longer.workout, spec, {
          swaps: frontForBack,
          duration: 45,
          constraints: longer.constraints,
        }),
      ),
    );
    const squat = allEntries(easier.workout.blocks).find((entry) => entry.id === front.id)!;
    const hinge = allEntries(easier.workout.blocks).find((entry) => entry.id === extra.id)!;
    // The pinned front squat takes a rep more in reserve (baseline).
    expect(
      working(squat).every((set) => set.targetRir >= 3),
      lifts(easier.workout),
    ).toBe(true);
    // Before: "dumbbell-romanian-deadlift x3 @RIR 1/1/1", as if the coach had added it.
    expect(
      working(hinge).every((set) => set.targetRir >= 2),
      lifts(easier.workout),
    ).toBe(true);
    expect(working(hinge).length, lifts(easier.workout)).toBeLessThanOrEqual(2);
  });
});

describe('an extra slot for a strength lift, the strength lifts first', () => {
  // A swap made at the rack, the glutes' Romanian deadlift for the hip thrust, goes at the gym to
  // the slot the quads and the glutes share, and the quads take an extra slot of their own, as the
  // sixth pass meant. The extra slot is the squat's, a strength slot, but it goes after every slot
  // of the template: the front squat comes after the curl, and "Why this workout" says it leads.

  function atGym() {
    const spec = behind('quads', 'glutes', 'biceps');
    const atRack = plan(spec, rack, { swaps: frontForBack });
    expect(exercises(atRack), lifts(atRack)).toEqual([
      'front-squat',
      'romanian-deadlift',
      'barbell-curl',
    ]);
    const hinge = allEntries(atRack.blocks).find(
      (entry) => entry.exerciseId === 'romanian-deadlift',
    )!;
    const swap = swapped(atRack, spec, hinge.id, 'hip-thrust', {
      location: rack,
      swaps: frontForBack,
    });
    return succeeded(
      recalibrate(
        request({ type: 'location' }, swap.workout, spec, {
          swaps: frontForBack,
          constraints: swap.constraints,
        }),
      ),
    ).workout;
  }

  /** The front squat's place against the curl's, in the plan's order. */
  const strengthBeforeCurl = (workout: GeneratedWorkout) => {
    const order = exercises(workout);
    expect(order, lifts(workout)).toContain('front-squat');
    const curl = order.findIndex((id) => requireExercise(id).movementPattern === 'elbow-flexion');
    expect(curl, lifts(workout)).toBeGreaterThanOrEqual(0);
    return order.indexOf('front-squat') < curl;
  };

  it('the quads’ front squat comes before the curl', () => {
    const workout = atGym();
    // Before: "hip-thrust x3; ez-bar-curl x3; front-squat x3".
    expect(strengthBeforeCurl(workout), lifts(workout)).toBe(true);
  });

  it('... and so it does with the Romanian deadlift pinned at the rack, no swap made', () => {
    const spec = behind('quads', 'glutes', 'biceps');
    const atRack = plan(spec, rack, { swaps: frontForBack });
    const pinned = structuredClone(atRack);
    const hinge = allEntries(pinned.blocks).find(
      (entry) => entry.exerciseId === 'romanian-deadlift',
    )!;
    hinge.pinned = true;
    hinge.locked = true;
    const workout = succeeded(
      recalibrate(request({ type: 'location' }, pinned, spec, { swaps: frontForBack })),
    ).workout;
    // Before: "romanian-deadlift x3; ez-bar-curl x3; front-squat x3".
    expect(strengthBeforeCurl(workout), lifts(workout)).toBe(true);
  });

  it('"Why this workout" says a lift leads only when it comes first', () => {
    const workout = atGym();
    const first = requireExercise(allEntries(workout.blocks)[0]!.exerciseId).name;
    const line = workout.explanation.reasons.find(isMainLiftLine);
    expect(line).toBeDefined();
    // Before: "Front Squat leads as the primary strength lift ...", the front squat third.
    const leads = line!.includes(' leads as ');
    expect(!leads || line!.startsWith(`${first} leads as `), `${line} :: ${lifts(workout)}`).toBe(
      true,
    );
  });
});

describe('a catch-up through one rebuild after another', () => {
  it('keeps its layout: a muscle a slot misses takes one slot of its own, not one more each time', () => {
    // Laid out at the gym, the quads and the glutes share the squat. At a rack, with the back squat
    // swapped for weeks, the front squat works the quads alone: the glutes take a slot of their own.
    const spec = behind('quads', 'glutes', 'biceps');
    const atGym = plan(spec, gym, { swaps: frontForBack });
    const pinned = structuredClone(atGym);
    const curl = allEntries(pinned.blocks).find(
      (entry) => requireExercise(entry.exerciseId).movementPattern === 'elbow-flexion',
    )!;
    curl.pinned = true;
    const options = { location: rack, swaps: frontForBack };
    const first = succeeded(recalibrate(request({ type: 'location' }, pinned, spec, options)));
    expect(directSets(first.workout, 'glutes'), lifts(first.workout)).toBeGreaterThan(0);
    const laidOut = first.workout.catchUpSlots?.length;
    expect(laidOut, lifts(first.workout)).toBe((atGym.catchUpSlots?.length ?? 0) + 1);
    // The rack's own curl pinned, so each rebuild after is one around what the plan keeps.
    let workout = structuredClone(first.workout);
    allEntries(workout.blocks).find(
      (entry) => requireExercise(entry.exerciseId).movementPattern === 'elbow-flexion',
    )!.pinned = true;
    let constraints = first.constraints;
    for (const choice of [30, 45, 'default'] as const) {
      const next = succeeded(
        recalibrate(
          request({ type: 'duration', choice }, workout, spec, { ...options, constraints }),
        ),
      );
      expect(next.scope, `${choice}`).toBe('partial');
      workout = next.workout;
      constraints = next.constraints;
      expect(workout.catchUpSlots?.length, `${choice}: ${lifts(workout)}`).toBe(laidOut);
    }
    expect(directSets(workout, 'glutes'), lifts(workout)).toBeGreaterThan(0);
  });
});

describe('a layout kept from another place, the eighth review of round M', () => {
  /** What the plan says leads, and the lift that comes first of those still to do. */
  const leadClaims = (workout: GeneratedWorkout) => {
    const first = requireExercise(
      allEntries(workout.blocks).find((entry) => !isStopped(entry))!.exerciseId,
    ).name;
    const line = workout.explanation.reasons.find(isMainLiftLine) ?? '';
    return {
      first,
      line,
      leads: line.includes(' leads as ') ? line.slice(0, line.indexOf(' leads as ')) : null,
      named: /, ([^,]+) first[,.]/.exec(workout.explanation.summary)?.[1] ?? null,
      summary: workout.explanation.summary,
    };
  };

  it('a lift begun at home leads at the gym, before the strength lift the gym fills in', () => {
    // A barbell and a bench, no rack: the glutes' hinge and the quads' lunge, neither a strength
    // slot. At the gym the quads' lunge goes to the front squat, a strength lift.
    const [bench] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['barbell', 'flat-bench'] },
      at(1),
    ) as [LocationProfile];
    const spec = behind('glutes', 'quads', 'biceps');
    const atHome = plan(spec, bench);
    const [hinge] = allEntries(atHome.blocks);
    expect(hinge?.exerciseId, lifts(atHome)).toBe('romanian-deadlift');
    const set = working(hinge!)[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 300,
      currentEntryId: hinge!.id,
      sets: [
        {
          entryId: hinge!.id,
          exerciseId: hinge!.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 8,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const atGym = succeeded(
      recalibrate(
        request({ type: 'location' }, atHome, spec, { completed, currentEntryId: hinge!.id }),
      ),
    ).workout;
    const claims = leadClaims(atGym);
    expect(claims.first, lifts(atGym)).toBe('Romanian Deadlift');
    // Before: "Front Squat leads as the primary strength lift ..." and "Catch-up: 3 exercises in
    // about 23 min, Front Squat first", the front squat second.
    expect(claims.leads === null || claims.leads === claims.first, claims.line).toBe(true);
    expect(claims.named, claims.summary).toBe(claims.first);
  });

  it('a strength slot added for a muscle a kept lift misses comes right after it, before the curl', () => {
    // Lunges disliked. Laid out at the gym, the quads and the glutes share the squat; at a bare home
    // it takes the glute bridge, and the quads a slot of their own, with nothing there. The bridge
    // pinned, the gym fills that slot with the front squat, the day's only strength lift.
    const profile: UserProfile = profileOf({
      exercisePreferences: {
        preferred: [],
        disliked: [
          'Bulgarian Split Squat',
          'Reverse Lunge',
          'Step-Up',
          'Dumbbell Bulgarian Split Squat',
          'Dumbbell Reverse Lunge',
        ],
      },
    });
    const [home] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['pull-up-bar'] },
      at(1),
    ) as [LocationProfile];
    const spec = behind('quads', 'glutes', 'biceps');
    const first = generateWorkout({
      profile,
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const pinnedCurl = structuredClone(first);
    allEntries(pinnedCurl.blocks).find((entry) => entry.exerciseId === 'ez-bar-curl')!.pinned =
      true;
    const atHome = succeeded(
      recalibrate(request({ type: 'location' }, pinnedCurl, spec, { location: home, profile })),
    );
    expect(exercises(atHome.workout)).toEqual(['glute-bridge']);
    const pinnedBridge = structuredClone(atHome.workout);
    allEntries(pinnedBridge.blocks).find((entry) => entry.exerciseId === 'glute-bridge')!.pinned =
      true;
    const atGym = succeeded(
      recalibrate(
        request({ type: 'location' }, pinnedBridge, spec, {
          profile,
          constraints: atHome.constraints,
        }),
      ),
    ).workout;
    // Before: "glute-bridge x3; ez-bar-curl x3; front-squat x3", "Front Squat leads as the primary
    // strength lift ...".
    expect(exercises(atGym), lifts(atGym)).toEqual(['glute-bridge', 'front-squat', 'ez-bar-curl']);
    const claims = leadClaims(atGym);
    expect(claims.leads === null || claims.leads === claims.first, claims.line).toBe(true);
    expect(claims.named, claims.summary).toBe('Glute Bridge');
  });

  it('a lift kept after a slot added keeps its own slot: the curl stays in the curl’s', () => {
    // A favourite barbell curl, pinned at the gym, where the quads and the glutes share the squat.
    // At the rack the front squat, in for the back squat for weeks, works the quads alone, and the
    // glutes take a slot right after it: the curl's slot moves on one, and the curl with it.
    const profile = profileOf({
      exercisePreferences: { preferred: ['Barbell Curl'], disliked: [] },
    });
    const spec = behind('quads', 'glutes', 'biceps');
    const atGym = generateWorkout({
      profile,
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, swaps: frontForBack },
    });
    const pinned = structuredClone(atGym);
    const curl = allEntries(pinned.blocks).find((entry) => entry.exerciseId === 'barbell-curl');
    expect(curl, lifts(atGym)).toBeDefined();
    curl!.pinned = true;
    const options = { location: rack, swaps: frontForBack, profile };
    const atRack = succeeded(recalibrate(request({ type: 'location' }, pinned, spec, options)));
    /** The movement of the slot the kept curl holds. */
    const curlSlot = (workout: GeneratedWorkout) => {
      const kept = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'barbell-curl');
      return kept?.slot === undefined ? undefined : workout.catchUpSlots?.[kept.slot]?.pattern;
    };
    expect(atRack.workout.catchUpSlots?.length, lifts(atRack.workout)).toBe(
      (atGym.catchUpSlots?.length ?? 0) + 1,
    );
    expect(curlSlot(atRack.workout), lifts(atRack.workout)).toBe('elbow-flexion');
    // ... and the next rebuild around it fills the glutes' slot, not the curl's.
    const after = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, atRack.workout, spec, {
          ...options,
          constraints: atRack.constraints,
        }),
      ),
    );
    expect(curlSlot(after.workout), lifts(after.workout)).toBe('elbow-flexion');
    expect(directSets(after.workout, 'glutes'), lifts(after.workout)).toBeGreaterThan(0);
  });

  it('a slot whose muscles have all had their sets stays out quietly where none of its lifts fit', () => {
    // At the gym, the bench press for the chest and the triceps, and the chin-up, pinned; the
    // triceps' own slot, an elbow extension, stays out. At a bare home the push-up gives the
    // triceps their sets, and no elbow extension fits there.
    const [home] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['pull-up-bar'] },
      at(1),
    ) as [LocationProfile];
    const spec = behind('chest', 'triceps', 'lats');
    const atGym = plan(spec, gym);
    expect(
      atGym.catchUpSlots?.map((slot) => slot.pattern),
      lifts(atGym),
    ).toContain('elbow-extension');
    const pinned = structuredClone(atGym);
    const chin = allEntries(pinned.blocks).find((entry) => entry.exerciseId === 'chin-up');
    expect(chin, lifts(atGym)).toBeDefined();
    chin!.pinned = true;
    chin!.locked = true;
    const result = succeeded(
      recalibrate(request({ type: 'location' }, pinned, spec, { location: home })),
    );
    expect(result.scope).toBe('partial');
    expect(directSets(result.workout, 'triceps'), lifts(result.workout)).toBeGreaterThanOrEqual(3);
    // A plan made at home says nothing of it either.
    expect(plan(spec, home).compromises).toEqual([]);
    // Before: ["No elbow extension option fits Home and your limits."].
    expect(result.workout.compromises, lifts(result.workout)).toEqual([]);
  });
});

describe('entries keep their names through a slot added, the ninth review of round M', () => {
  // A slot added for a muscle a lift misses keeps its own number, after the layout's, and only the
  // plan's order puts it right after that lift: the slots after it keep theirs, and so the names
  // of their lifts, which the change list matches.
  const profile = profileOf({ exercisePreferences: { preferred: ['Barbell Curl'], disliked: [] } });
  const spec = behind('quads', 'glutes', 'biceps', 'triceps');
  const options = { location: rack, swaps: frontForBack, profile };
  const named = (workout: GeneratedWorkout) =>
    JSON.stringify(
      Object.fromEntries(allEntries(workout.blocks).map((entry) => [entry.id, entry.exerciseId])),
    );

  /** Laid out at the gym, the favourite barbell curl pinned; then the rack, the glutes' slot added. */
  function atTheRack() {
    const atGym = generateWorkout({
      profile,
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, swaps: frontForBack },
    });
    const pinned = structuredClone(atGym);
    const curl = allEntries(pinned.blocks).find((entry) => entry.exerciseId === 'barbell-curl');
    expect(curl, lifts(atGym)).toBeDefined();
    curl!.pinned = true;
    const moved = succeeded(recalibrate(request({ type: 'location' }, pinned, spec, options)));
    expect(moved.workout.catchUpSlots?.length, lifts(moved.workout)).toBe(
      (atGym.catchUpSlots?.length ?? 0) + 1,
    );
    return { atGym: pinned, moved };
  }

  it('a change of length after it replaces no lift', () => {
    const { moved } = atTheRack();
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, moved.workout, spec, {
          ...options,
          constraints: moved.constraints,
        }),
      ),
    );
    const placed = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks).map((entry) => `${entry.slot}:${entry.exerciseId}`);
    expect(placed(shorter.workout)).toEqual(placed(moved.workout));
    // Before: "Recalibrated to 45 min: 2 exercises replaced.", the Romanian deadlift and the skull
    // crusher trading names.
    expect(
      shorter.changes.filter((change) => change.kind !== 'adjusted'),
      `${shorter.summary.headline} ${named(moved.workout)} -> ${named(shorter.workout)}`,
    ).toEqual([]);
  });

  it('the change of place tells the triceps’ lift as replaced, not left out and added', () => {
    const { atGym, moved } = atTheRack();
    const triceps = allEntries(atGym.blocks).find(
      (entry) => entry.exerciseId === 'cable-triceps-pushdown',
    );
    expect(triceps, lifts(atGym)).toBeDefined();
    // Before: "Left out Cable Triceps Pushdown." and "Added Skull Crusher.".
    expect(
      moved.changes.find((change) => change.entryId === triceps!.id),
      moved.changes.map((change) => change.detail).join(' | '),
    ).toMatchObject({ kind: 'replaced', previousExerciseId: 'cable-triceps-pushdown' });
  });

  it('a curl begun at the gym and stood in for at the rack reads as its stand-in', () => {
    // No favourite: the gym's curl is the EZ-bar curl, which the rack cannot equip. One set done.
    const atGym = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, swaps: frontForBack },
    });
    const curl = allEntries(atGym.blocks).find((entry) => entry.exerciseId === 'ez-bar-curl');
    expect(curl, lifts(atGym)).toBeDefined();
    const set = working(curl!)[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 300,
      sets: [
        {
          entryId: curl!.id,
          exerciseId: curl!.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 8,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const moved = succeeded(
      recalibrate(
        request({ type: 'location' }, atGym, spec, {
          ...options,
          profile: profileOf(),
          completed,
        }),
      ),
    );
    const stopped = allEntries(moved.workout.blocks).find((entry) => entry.id === curl!.id);
    expect(stopped && isStopped(stopped), lifts(moved.workout)).toBe(true);
    const stand = allEntries(moved.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.slot === stopped!.slot,
    );
    expect(stand?.exerciseId, lifts(moved.workout)).toBe('barbell-curl');
    // Before: "Replaced Cable Triceps Pushdown with Barbell Curl.", the stand-in named as the
    // pushdown was at the gym.
    expect(
      moved.changes.find((change) => change.entryId === stand!.id),
      moved.changes.map((change) => change.detail).join(' | '),
    ).toMatchObject({ kind: 'replaced', previousExerciseId: 'ez-bar-curl' });
  });
});

describe('the slots filled in the plan’s order, the tenth review of round M', () => {
  // A slot added keeps its number, after the layout's, and is filled right after the slot it was
  // added for: its lift is planned, and its muscles' sets spent, where the lifter does it.
  const profile = profileOf({ exercisePreferences: { preferred: ['Barbell Curl'], disliked: [] } });

  /** Laid out at the gym with the favourite curl pinned, then moved to the rack. */
  function atTheRack(spec: CatchUpSpec, history = records) {
    const atGym = generateWorkout({
      profile,
      location: gym,
      history,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, swaps: frontForBack },
    });
    const pinned = structuredClone(atGym);
    const curl = allEntries(pinned.blocks).find((entry) => entry.exerciseId === 'barbell-curl');
    expect(curl, lifts(atGym)).toBeDefined();
    curl!.pinned = true;
    const moved = succeeded(
      recalibrate(
        request({ type: 'location' }, pinned, spec, {
          profile,
          location: rack,
          swaps: frontForBack,
          history,
        }),
      ),
    ).workout;
    expect(moved.catchUpSlots?.length, lifts(moved)).toBe((atGym.catchUpSlots?.length ?? 0) + 1);
    return moved;
  }

  it('its lift is targeted for its place: the work after it is no work before it', () => {
    // Romanian deadlifts done on their own last Friday; at the rack the glutes' slot takes them,
    // second in the plan, before the calf raise and the curl.
    const history = [...records, session(at(4, 18), [['romanian-deadlift', 3]])];
    const spec = behind('quads', 'glutes', 'calves', 'biceps');
    const moved = atTheRack(spec, history);
    expect(exercises(moved).slice(0, 2), lifts(moved)).toEqual([
      'front-squat',
      'romanian-deadlift',
    ]);
    const hinge = allEntries(moved.blocks).find(
      (entry) => entry.exerciseId === 'romanian-deadlift',
    )!;
    // Before: "Before this today: about 3 sets on these muscles ...: down a step.", the calf raise
    // after it counted.
    expect(
      hinge.progression?.evidence.find((text) => text.startsWith('Before this today')),
      `${lifts(moved)} :: ${hinge.progression?.evidence.join(' / ')}`,
    ).toBeUndefined();
    // A plan laid out at the rack has it in the same place, at the same target.
    const fresh = generateWorkout({
      profile,
      location: rack,
      history,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, swaps: frontForBack },
    });
    const own = allEntries(fresh.blocks).find((entry) => entry.exerciseId === 'romanian-deadlift');
    expect(exercises(fresh)[1], lifts(fresh)).toBe('romanian-deadlift');
    expect(working(hinge)[0]?.targetWeight, lifts(moved)).toBe(working(own!)[0]?.targetWeight);
  });

  it('the glutes the front squat misses are worked right after it, before the curl', () => {
    // Laid out at the gym: the leg press for the quads and the glutes, the curl, the leg curl for
    // the hamstrings.
    const moved = atTheRack(behind('quads', 'glutes', 'biceps', 'hamstrings'));
    const order = exercises(moved);
    expect(order[0], lifts(moved)).toBe('front-squat');
    const glutes = order.findIndex((id) => requireExercise(id).primaryMuscles.includes('glutes'));
    expect(glutes, lifts(moved)).toBeGreaterThan(0);
    // Before: "front-squat x3; barbell-curl x3; romanian-deadlift x3", the hamstrings' slot filled
    // before the glutes' own.
    expect(glutes, lifts(moved)).toBeLessThan(order.indexOf('barbell-curl'));
  });

  it('a stand-in never takes the name of a slot added beside it', () => {
    // The bench press begun at the gym, one set done. At a barbell and a rack with no bench, the
    // push-up stands in for its sets to come, and the glutes take a slot of their own.
    const [home] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['barbell', 'squat-rack'] },
      at(1),
    ) as [LocationProfile];
    const spec = behind('chest', 'quads', 'glutes');
    const options = { location: home, swaps: frontForBack };
    const atGym = plan(spec, gym, { swaps: frontForBack });
    const bench = allEntries(atGym.blocks)[0]!;
    expect(bench.exerciseId, lifts(atGym)).toBe('barbell-bench-press');
    const set = working(bench)[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 300,
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 8,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const moved = succeeded(
      recalibrate(request({ type: 'location' }, atGym, spec, { ...options, completed })),
    );
    const stand = allEntries(moved.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.slot === bench.slot,
    );
    expect(stand?.exerciseId, lifts(moved.workout)).toBe('push-up');
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, moved.workout, spec, {
          ...options,
          completed,
          constraints: moved.constraints,
        }),
      ),
    );
    const placed = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks).map((entry) => `${entry.slot}:${entry.exerciseId}`);
    expect(placed(shorter.workout)).toEqual(placed(moved.workout));
    // Before: "Recalibrated to 45 min with 5 min done: 2 exercises replaced.", the push-up and the
    // Romanian deadlift trading names.
    expect(
      shorter.changes.filter((change) => change.kind !== 'adjusted'),
      shorter.summary.headline,
    ).toEqual([]);
  });
});
