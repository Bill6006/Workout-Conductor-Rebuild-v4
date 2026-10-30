import { describe, expect, it } from 'vitest';
import { allEntries } from '../../engine/workout/types';
import { startedMain, type Started } from '../../test/startedMain';

/**
 * Round N (item 11), the fresh review before shipping, on the combined code (rounds M, N, Maintenance 33).
 *
 * The rule (docs/reports/maintenance-32.md, "Delivered"): "The day's effort moves every set: 'Make
 * it easier' takes the top set to 2 in reserve and the back-offs to 3; 'harder' takes the back-offs
 * to 1". A lift under way is left as it is by a change of effort, "where a pick-up after it takes
 * the day's reserve" (the accepted known limit, from before the round). A straight lift picked up
 * again does take it: the triceps pushdown below, logged once, comes back after home and back at the
 * day's reserve.
 *
 * The defect: a lift picked up again after its top set gives its back-offs the top set's own reps
 * (`ownRepsOf(top)`) and `backOffRir(top's reserve, the day's reserve)`, the top set as it stands
 * (generate.ts `reopened`; recalibrate.ts `asBackOffs`). That carries whatever changed the top set
 * alone, not the day's back-offs: after "Make it easier" the back-offs come back at 2 where the day
 * asks 3; after "easier" then "harder" (a plain day again) at 3 where the day asks 2; and under a head
 * cold told with the lift under way (Maintenance 33's floor holds the top set at 2, a rep fewer, and
 * leaves the back-offs at 4-6 at 2), at 3-5 at 3, which stays once the illness is taken back, since
 * the floor's record (`floored`) never held them.
 *
 * Synthetic data only.
 */

const well = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

/** The row's back-offs still to come: reps and reserve. */
const backOffShape = (s: Started) =>
  s
    .main()
    .sets.filter((set) => set.tier === 'back-off' && !s.done(set.index))
    .map(
      (set) => `${set.targetWeight} x ${set.targetReps[0]}-${set.targetReps[1]} @ ${set.targetRir}`,
    );

function pushdownToCome(s: Started): number[] {
  const session = s.store.getSnapshot().session!;
  const entry = allEntries(session.workout.blocks).find(
    (one) => one.exerciseId === 'cable-triceps-pushdown' && !one.stopped,
  )!;
  return entry.sets
    .filter(
      (set) =>
        set.kind === 'working' &&
        !session.completed.sets.some(
          (log) => log.entryId === entry.id && log.setIndex === set.index,
        ),
    )
    .map((set) => set.targetRir);
}

/** The row's back-offs still to come: their reserve. */
const backOffRirs = (s: Started) =>
  s
    .main()
    .sets.filter((set) => set.tier === 'back-off' && !s.done(set.index))
    .map((set) => set.targetRir);

async function liftTopAndPushdown(s: Started) {
  const top = s.main().sets.find((set) => set.tier === 'top')!;
  await s.store.logSet(s.main().id, top.index, {
    weight: top.targetWeight,
    reps: 5,
    rir: top.targetRir,
  });
  const pushdown = allEntries(s.store.getSnapshot().session!.workout.blocks).find(
    (one) => one.exerciseId === 'cable-triceps-pushdown' && !one.stopped,
  )!;
  const first = pushdown.sets.find((set) => set.kind === 'working')!;
  await s.store.logSet(pushdown.id, first.index, {
    weight: first.targetWeight,
    reps: first.targetReps[0] + 1,
    rir: first.targetRir,
  });
}

describe('back-offs picked up again after the day’s effort changed past the top set', () => {
  it('home and back after "Make it easier": the back-offs take the day’s reserve, 3', async () => {
    const s = await startedMain();
    await liftTopAndPushdown(s);
    // Baseline: a plain day, the back-offs at 2, the pushdown at 1.
    expect(backOffRirs(s)).toEqual([2, 2, 2]);
    expect(pushdownToCome(s)).toEqual([1, 1]);
    await s.store.recalibrate({ type: 'intensity', direction: 'easier' });
    // Both under way: left as they are (the known limit).
    expect(backOffRirs(s)).toEqual([2, 2, 2]);
    await s.homeAndBack();
    // The straight lift picked up again takes the day's reserve, a rep more.
    expect(pushdownToCome(s)).toEqual([2, 2]);
    // The main lift's back-offs: 2 on the combined code, where "easier" asks 3.
    expect({ backOffs: backOffRirs(s) }).toEqual({ backOffs: [3, 3, 3] });
  });

  it('home and back after "easier" then "harder": a plain day, the back-offs at 2', async () => {
    const s = await startedMain();
    await s.store.recalibrate({ type: 'intensity', direction: 'easier' });
    await liftTopAndPushdown(s);
    // Baseline: the easier day, a set fewer, the top set at 2 and the back-offs at 3.
    expect(backOffRirs(s)).toEqual([3, 3]);
    await s.store.recalibrate({ type: 'intensity', direction: 'harder' });
    expect(s.store.getSnapshot().session!.constraints.intensity).toBe(0);
    await s.homeAndBack();
    // The straight lift picked up again: the plain day's reserve.
    expect(pushdownToCome(s)).toEqual([1]);
    // The main lift's back-offs: 3 on the combined code, where a plain day asks 2.
    expect({ backOffs: backOffRirs(s) }).toEqual({ backOffs: [2, 2] });
  });

  it('swapped away and back after "easier" then "harder": a plain day, the back-offs at 2', async () => {
    const s = await startedMain();
    await s.store.recalibrate({ type: 'intensity', direction: 'easier' });
    await liftTopAndPushdown(s);
    expect(backOffRirs(s)).toEqual([3, 3]);
    await s.store.recalibrate({ type: 'intensity', direction: 'harder' });
    // Baseline: the straight pushdown, begun on the easier day, swapped away and back the same way,
    // comes back at the plain day's reserve (1): a swap keeps an effort only as far as the day's
    // settings reach (Maintenance 24).
    const pushdown = () =>
      allEntries(s.store.getSnapshot().session!.workout.blocks).find(
        (one) => one.exerciseId === 'cable-triceps-pushdown' && !one.stopped,
      )!;
    await s.store.recalibrate({
      type: 'replace',
      entryId: pushdown().id,
      exerciseId: 'cable-overhead-triceps-extension',
    });
    const standIn = allEntries(s.store.getSnapshot().session!.workout.blocks).find(
      (one) => one.exerciseId === 'cable-overhead-triceps-extension' && !one.stopped,
    )!;
    await s.store.recalibrate({
      type: 'replace',
      entryId: standIn.id,
      exerciseId: 'cable-triceps-pushdown',
    });
    expect(pushdownToCome(s)).toEqual([1]);
    await s.swapAwayAndBack();
    // The main lift's back-offs: 3 on the combined code, where the plain day asks 2.
    expect({ backOffs: backOffRirs(s) }).toEqual({ backOffs: [2, 2] });
  });
});

describe('back-offs picked up again after a head cold held the top set alone', () => {
  for (const path of ['home', 'swap'] as const) {
    it(`${path === 'home' ? 'home and back' : 'swapped away and back'}: they keep 4-6 at 2, the illness taken back too`, async () => {
      const s = await startedMain();
      const { store, main } = s;
      // Under way: a ramp logged, then a head cold told.
      const ramp = main().sets.find((set) => set.kind === 'warmup')!;
      await store.logSet(main().id, ramp.index, {
        weight: ramp.targetWeight,
        reps: ramp.targetReps[0],
        rir: 5,
      });
      await store.recalibrate({ type: 'readiness', readiness: { ...well, illness: 'head' } });
      const top = main().sets.find((set) => set.tier === 'top')!;
      // Baseline: the floor (2) holds the top set at 2, a rep fewer; the back-offs, at 2, it leaves.
      expect([top.targetReps, top.targetRir]).toEqual([[3, 5], 2]);
      expect(backOffShape(s)).toEqual(['135 x 4-6 @ 2', '135 x 4-6 @ 2', '135 x 4-6 @ 2']);
      await store.logSet(main().id, top.index, { weight: 140, reps: 4, rir: 2 });
      expect(backOffShape(s)).toEqual(['135 x 4-6 @ 2', '135 x 4-6 @ 2', '135 x 4-6 @ 2']);
      if (path === 'home') await s.homeAndBack();
      else await s.swapAwayAndBack();
      const picked = backOffShape(s);
      await store.recalibrate({ type: 'readiness', readiness: { ...well } });
      // On the combined code: 135 x 3-5 @ 3 after the pick-up, and still after the illness goes.
      expect({ picked, afterIllness: backOffShape(s) }).toEqual({
        picked: ['135 x 4-6 @ 2', '135 x 4-6 @ 2', '135 x 4-6 @ 2'],
        afterIllness: ['135 x 4-6 @ 2', '135 x 4-6 @ 2', '135 x 4-6 @ 2'],
      });
    });
  }
});
