import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import {
  DOWN,
  MOVE,
  MOVED,
  ROW,
  USUAL,
  WATCH_NOW,
  weeksAfter,
  weeksBefore,
  type Lifts,
} from '../../test/scheduleWatch';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  WATCH_SOURCE,
  conductCoach,
  declineKey,
  gatherSignals,
  isDeclined,
  isNudge,
  type CoachInput,
  type CoachSignal,
} from './coachConductor';

/**
 * Maintenance 36, the schedule watch's card: before a workout starts, one card names the lifts down
 * since the change, with the schedule before it under the card, one tap away; never in a workout,
 * never with its switch off; Not now keeps it away for that change. The lifter moved from three
 * days a week to five on Monday 7 September. Synthetic data only.
 */

const base = { ...createDefaultProfile('2026-08-01T12:00:00.000Z'), bodyweight: 185 };
const profile = { ...base, schedule: { ...base.schedule, ...MOVED } };
const [, gym] = createDefaultLocations({ gymAccess: true }, '2026-08-01T12:00:00.000Z');

function input(lifts: Lifts = DOWN, patch: Partial<CoachInput> = {}): CoachInput {
  const history = [...weeksBefore({ ...USUAL, [ROW]: [8, 135, 2] }), ...weeksAfter(lifts)];
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: WATCH_NOW,
    duration: 'default',
  });
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: WATCH_NOW,
    fatigue: interpretFatigue(history, WATCH_NOW),
    strategy: [],
    lastExportAt: WATCH_NOW,
    workoutCount: history.length,
    scheduleMove: MOVE,
    ...patch,
  };
}

const card = (coach: CoachInput): CoachSignal | undefined =>
  gatherSignals(coach).find((signal) => signal.source.startsWith(`${WATCH_SOURCE}|`));

describe('the schedule watch’s card', () => {
  it('names the lifts down since the change, by about how much, and the schedule before, one tap away', () => {
    const signal = card(input());
    expect(signal).toBeDefined();
    expect(signal!.headline).toBe(
      'Barbell Bench Press and Back Squat down since the schedule changed',
    );
    expect(signal!.why).toEqual([
      'Your first sets in the four weeks after the change on Sep 7: Barbell Bench Press about 7% and Back Squat about 7% under the weeks before.',
      'Still under after 3 days or more without hard sets for them: more than a hard week.',
    ]);
    expect(signal!.footnote).toBe('The schedule before: 3 days a week, on Mon, Wed and Fri.');
    expect(signal!.action).toEqual({
      kind: 'schedule',
      weeklyFrequency: 3,
      availableDays: ['mon', 'wed', 'fri'],
      back: true,
      label: 'Go back to it',
    });
    expect(signal!.domain).toBe('recovery');
    // Below a same-day "too soon" card (severity 2), which is about the workout on the screen.
    expect(signal!.severity).toBe(1);
    // One of the approved proposal's new cards: the owner's card limits hold it (decision 5).
    expect(isNudge(signal!)).toBe(true);
  });

  it('says nothing in a workout under way, with its switch off, or without a change to watch', () => {
    expect(card(input(DOWN, { status: 'active' }))).toBeUndefined();
    expect(card(input(DOWN, { switches: { scheduleWatch: false } }))).toBeUndefined();
    expect(card(input(DOWN, { scheduleMove: null }))).toBeUndefined();
    // The other switches off leave it be.
    expect(card(input(DOWN, { switches: { tooSoon: false, goalsTime: false } }))).toBeDefined();
  });

  it('keeps the schedule before on the card a lifter shown two Why lines sees', () => {
    const shown = conductCoach(input())!;
    expect(shown.signal.source).toBe(card(input())!.source);
    expect(shown.signal.why).toHaveLength(2);
    expect(shown.signal.footnote).toContain('Mon, Wed and Fri');
  });

  it('stays away after Not now for that change, whatever lift falls since', () => {
    const shown = card(input())!;
    const declines = {
      id: 'coach-declines' as const,
      declines: { [declineKey(shown)]: { count: 1, lastAt: WATCH_NOW } },
    };
    // Weeks on, the same change's card stays away, a third lift down too.
    expect(isDeclined(declines, shown, '2026-10-30T12:00:00.000Z')).toBe(true);
    const more = card(input({ ...DOWN, [ROW]: [8, 125, 2] }))!;
    expect(more.headline).toContain('Barbell Row');
    expect(isDeclined(declines, more, WATCH_NOW)).toBe(true);
    // Another change, an hour later, is another card.
    const later = new Date(Date.parse(MOVE.at) + 3_600_000).toISOString();
    const other = card(input(DOWN, { scheduleMove: { ...MOVE, at: later } }))!;
    expect(isDeclined(declines, other, WATCH_NOW)).toBe(false);
  });
});
