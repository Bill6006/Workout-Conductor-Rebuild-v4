import { describe, expect, it } from 'vitest';
import { localWeekday } from '../time/localDate';
import { at } from '../../test/clockDays';
import {
  describe as describeWorkout,
  doToday,
  lifterStore,
  sessionOf,
} from '../../test/lifterDays';

/**
 * Fresh review of round M, F3: a catch-up still moves the split's rotation on, through the muscles
 * it trained rather than its template.
 *
 * The rule (docs/reports/maintenance-31.md, item 12): "A catch-up leaves the split's rotation as it
 * was: the next planned day plans as if the catch-up had held none of the split's sessions", and its
 * known limit: "so a muscle caught up on a Wednesday is trained again on its own day". The first
 * review's MEDIUM ("a catch-up moved the split's rotation on") was fixed by leaving the catch-up's
 * template out of `recentTemplates`; `chooseTemplate` still reads the catch-up's sets through its
 * week-aware term (a muscle trained in the last two days counts against a template) and the
 * priorities' freshness, so the template a catch-up's muscles lead goes back a day.
 *
 * The lifter (synthetic): the default profile (Monday, Tuesday, Thursday and Friday), Monday push
 * and Tuesday lower done at 8:00. On Wednesday the 2nd at 8:00 one lifter takes the catch-up offered
 * (shrug, rear-delt fly, chin-up: the traps, rear delts and lats), the other does not. Thursday,
 * without it: pull. With it: upper, and the pull day goes to Friday, the push day to the next week.
 */

async function thursdayAfter(takeCatchUp: boolean) {
  const lifter = await lifterStore(at(0, 6));
  const ticked = lifter.store.getSnapshot().profile!.schedule.availableDays;
  for (let day = 0; day <= 2; day += 1) {
    lifter.clock.now = at(day, 8);
    lifter.store.refreshSession();
    const ticks = ticked.includes(localWeekday(lifter.clock.now));
    if (ticks) await doToday(lifter);
    else if (takeCatchUp) {
      expect(sessionOf(lifter).workout.templateId).toBe('catch-up');
      await doToday(lifter);
    }
  }
  lifter.clock.now = at(3, 8);
  lifter.store.refreshSession();
  return sessionOf(lifter).workout;
}

describe('a catch-up and the split’s rotation', () => {
  it('leaves Thursday the session it would have been', async () => {
    const without = await thursdayAfter(false);
    const after = await thursdayAfter(true);
    expect(without.templateId).toBe('pull-arms');
    // On b826d24: "upper" after the catch-up of the traps, rear delts and lats.
    expect(after.templateId, describeWorkout(after).join(' | ')).toBe(without.templateId);
  }, 120_000);
});
