import { describe, expect, it } from 'vitest';
import { allEntries, type WorkoutBlock } from '../../engine/workout/types';
import { at } from '../../test/clockDays';
import { doToday, lifterStore, sessionOf } from '../../test/lifterDays';

/**
 * Fresh review of round M, F2: a second workout's supersets pair a lift for what is left of today's
 * work with one for what was missed, so the remainder comes before lifts for what was missed.
 *
 * The rule (docs/reports/maintenance-31.md, item 32): "It leads with the muscles behind this week
 * that were not trained today and are outside the 48 hours, dosed as a catch-up's, their strength
 * lifts first; what is left of today's work comes after them." The ninth review fixed the layout
 * ("a second workout lays out what was missed first, each part with its strength lifts first"):
 * `catchUpTemplate` orders the slots so. The superset step that follows (`profile.techniques.
 * supersets`, on by default) pairs the first isolation lift with the next one that shares no main
 * muscle and moves it up beside it, whichever part of the session either is in.
 *
 * The lifter (synthetic): the default profile, supersets on, every day's plan done in full at 8:00
 * from Monday the 31st of August, the days not ticked taking their catch-up; on Wednesday the 9th
 * the catch-up is cut short after two lifts and the second workout done. On Tuesday the 15th, the
 * lower day is cut short after the back squat and the Romanian deadlift. At 18:00 the second
 * workout leads with the calves, traps, rear delts and lats, the quads, hamstrings and glutes taking
 * what is left. Its blocks: calf raise + shrug, rear-delt fly + LEG CURL (the hamstrings' remainder),
 * pull-up (the lats, missed), leg press (the remainder). "Why this workout" says it leads with what
 * was missed, "calves, traps, rear delts and lats".
 */

async function secondAfterLowerCutShort() {
  const lifter = await lifterStore(at(0, 7));
  for (let day = 0; day <= 15; day += 1) {
    lifter.clock.now = at(day, 8);
    lifter.store.refreshSession();
    if (allEntries(sessionOf(lifter).workout.blocks).length === 0) continue;
    const cut = day === 9 || day === 15;
    await doToday(lifter, cut ? { lifts: 2, endedEarly: true } : {});
    if (!cut) continue;
    lifter.clock.now = at(day, 18);
    lifter.store.refreshSession();
    if (day === 9) await doToday(lifter);
  }
  return sessionOf(lifter);
}

/** What each block is for: "missed" when a lift in it works a muscle behind, else "left". */
function parts(blocks: readonly WorkoutBlock[], why: Map<string, string>): string[] {
  return blocks.map((block) =>
    block.entries.some((entry) => entry.chosenFor.some((muscle) => why.get(muscle) === 'behind'))
      ? 'missed'
      : 'left',
  );
}

describe('a second workout with supersets on', () => {
  it('does what is left of today’s work after every lift for what was missed', async () => {
    const second = await secondAfterLowerCutShort();
    const spec = second.constraints.catchUp!;
    expect(spec.kind).toBe('second');
    expect(second.workout.templateId).toBe('second-workout');
    const why = new Map(spec.muscles.map((item) => [item.muscle as string, item.why as string]));
    expect(why.get('lats')).toBe('behind');
    expect(why.get('hamstrings')).toBe('remainder');
    expect(second.workout.explanation.reasons[0]).toMatch(/^A second workout today: it leads with/);
    // The lifts in the order the lifter does them: each block, a superset's two in turn.
    const order = second.workout.blocks.map(
      (block) =>
        `${block.entries.map((entry) => `${entry.exerciseId} [${entry.chosenFor.join(', ')}]`).join(' + ')}`,
    );
    // Every lift for what is left comes after the last lift for what was missed. On b826d24:
    // ["missed", "missed", "missed", "left"] by block, the second block's superset carrying the leg
    // curl for the hamstrings' remainder before the pull-up for the lats.
    const remainderLifts = allEntries(second.workout.blocks).filter((entry) =>
      entry.chosenFor.every((muscle) => why.get(muscle) === 'remainder'),
    );
    const missedLifts = allEntries(second.workout.blocks).filter((entry) =>
      entry.chosenFor.some((muscle) => why.get(muscle) === 'behind'),
    );
    const blockOf = (id: string) =>
      second.workout.blocks.findIndex((block) => block.entries.some((entry) => entry.id === id));
    const firstLeft = Math.min(...remainderLifts.map((entry) => blockOf(entry.id)));
    const lastMissed = Math.max(...missedLifts.map((entry) => blockOf(entry.id)));
    expect(parts(second.workout.blocks, why).length).toBe(second.workout.blocks.length);
    expect(firstLeft, order.join(' || ')).toBeGreaterThan(lastMissed);
  }, 120_000);
});
