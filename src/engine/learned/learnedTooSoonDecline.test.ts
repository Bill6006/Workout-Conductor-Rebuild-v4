import { describe, expect, it } from 'vitest';
import { localWeekKey } from '../../core/time/localDate';
import { createDefaultProfile } from '../../core/validation/profile';
import {
  TOO_SOON_SOURCE,
  emptyDeclines,
  isDeclined,
  recordDecline,
  type CoachSignal,
} from '../coach/coachConductor';
import { learnedSections } from './learned';
import { emptyResets } from './resets';
import { RECORD_NOW } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: the learned page lists a "too soon" card's
 * Not now as an unnamed offer, back on the wrong day, and keeps it listed for good.
 *
 * Steps: on Thursday 10 September the lifter taps Not now on "The chest may not have recovered"
 * (its source names the muscle and the week, `too-soon|chest|2026-09-07`). They open Settings,
 * What the app learned, Offers you declined, that day, the Monday after, and four weeks on.
 *
 * The rule: decision 5, "'Not now' skips that muscle for the week" (the card's source names the
 * week, so next week's card is a new one, `untilNew`); the learned page names "Every offer by what
 * it offered, never by the coach's own name for it (the review of item 47)", says when each comes
 * back, and lists a put-away card only while it keeps something away (the pain pattern's rule: "one
 * whose pattern has moved on, or gone, keeps nothing away and is not listed").
 *
 * What happens: `declineName` has no name for the source, so the line reads "An offer: declined
 * Sep 10: back from Sep 17." The chest's card is back on Monday 14 September (a new week, a new
 * source), not the 17th; and since every week's Not now is a key of its own, the line stays for good
 * ("An offer: declined Sep 10.") and a new one is added each week.
 *
 * Synthetic data only.
 */

const profile = createDefaultProfile(RECORD_NOW);
const DAY = 86_400_000;
const dayAfter = (days: number) => new Date(Date.parse(RECORD_NOW) + days * DAY).toISOString();

const chestCard = (now: string): CoachSignal => ({
  domain: 'recovery',
  headline: 'The chest may not have recovered',
  why: [],
  action: {
    kind: 'recalibrate',
    trigger: { type: 'lighter', muscle: 'chest' },
    label: 'Lighter for the chest',
  },
  confidence: 'medium',
  severity: 2,
  source: `${TOO_SOON_SOURCE}|chest|${localWeekKey(now)}`,
  untilNew: true,
});

const declinedLines = (declines: ReturnType<typeof emptyDeclines>, now: string) =>
  learnedSections({ history: [], profile, now, resets: emptyResets(), declines }).find(
    (section) => section.key === 'declines',
  )!.items;

describe('a "too soon" Not now on the learned page', () => {
  it('names the offer, says it is back with the new week, and goes once that week has', () => {
    const declines = recordDecline(emptyDeclines(), chestCard(RECORD_NOW), RECORD_NOW);
    // The coach itself: away this week, back on Monday 14 September with the next week's card.
    expect(isDeclined(declines, chestCard(dayAfter(1)), dayAfter(1))).toBe(true);
    expect(localWeekKey(dayAfter(4))).not.toBe(localWeekKey(RECORD_NOW));
    expect(isDeclined(declines, chestCard(dayAfter(4)), dayAfter(4))).toBe(false);

    const today = declinedLines(declines, RECORD_NOW);
    expect(today).toHaveLength(1);
    expect(today[0]).not.toMatch(/^An offer:/);
    expect(today[0]).not.toContain('back from Sep 17');
    // Four weeks on it keeps nothing away, and is not listed.
    expect(declinedLines(declines, dayAfter(28))).toEqual([]);
  });
});
