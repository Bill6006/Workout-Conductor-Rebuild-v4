import { CLOUD_OFFLINE } from '../../core/state/appStore';
import { describe, expect, it } from 'vitest';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import {
  cloudSummary,
  daysText,
  goalsSummary,
  limitationsSummary,
  preferencesSummary,
  programmingSummary,
  scheduleSummary,
  unitsSummary,
} from './summaries';

/**
 * Maintenance 25, the owner's item 5: a Settings row shows its current value before it is opened,
 * so reading a setting takes no scrolling through its editor.
 */

const NOW = '2026-09-26T12:00:00.000Z';
const base = createDefaultProfile(NOW);
const withOverrides = (overrides: Partial<UserProfile>): UserProfile => ({ ...base, ...overrides });

describe('the current value on each Settings row', () => {
  it('names the goals, the second one when there is one', () => {
    expect(goalsSummary(base)).toMatch(/^Build muscle/);
    expect(goalsSummary(withOverrides({ goals: { ...base.goals, secondary: 'none' } }))).toBe(
      'Build muscle',
    );
    expect(
      goalsSummary(withOverrides({ goals: { ...base.goals, secondary: 'bigger-arms' } })),
    ).toBe('Build muscle, then bigger arms');
    // Losing fat changes what the plan does, so the row says so (Maintenance 25).
    expect(
      goalsSummary(
        withOverrides({ goals: { ...base.goals, secondary: 'bigger-arms', bodyweight: 'lose' } }),
      ),
    ).toBe('Build muscle, then bigger arms · losing fat');
  });

  it('names the style, the techniques allowed, and the rests', () => {
    // The switches allow a technique; a style may still plan none, so the row says "allows".
    const on = withOverrides({ techniques: { supersets: true, dropSets: true, circuits: false } });
    expect(programmingSummary(on)).toMatch(/ · allows supersets and drop sets · standard rests$/);
    const all = withOverrides({ techniques: { supersets: true, dropSets: true, circuits: true } });
    expect(programmingSummary(all)).toMatch(/ · allows supersets, drop sets and circuits · /);
    const off = withOverrides({
      techniques: { supersets: false, dropSets: false, circuits: false },
      restStyle: 'long',
    });
    expect(programmingSummary(off)).toMatch(
      / · supersets, drop sets and circuits off · long rests$/,
    );
  });

  it('names experience, sessions, length and the days, in week order', () => {
    expect(scheduleSummary(base)).toBe('Intermediate · 4 a week · 60 min · Mon, Tue, Thu, Fri');
    const days = withOverrides({
      schedule: { ...base.schedule, availableDays: ['sun', 'mon', 'wed'] },
    });
    expect(daysText(days)).toBe('Mon, Wed, Sun');
  });

  it('counts the preferences, and says when there are none', () => {
    expect(preferencesSummary(base)).toBe('None marked');
    expect(
      preferencesSummary(
        withOverrides({
          exercisePreferences: {
            ...base.exercisePreferences,
            preferred: ['chin-up', 'barbell-row'],
            disliked: ['dips'],
          },
        }),
      ),
    ).toBe('2 loved · 1 avoided');
  });

  it('names the pain areas and counts the movement limits', () => {
    expect(limitationsSummary(base)).toBe('None');
    expect(
      limitationsSummary(
        withOverrides({
          limitations: {
            ...base.limitations,
            painAreas: ['knee', 'shoulder'],
            shoulder: ['avoid-dips'],
            avoidBarbellSquats: true,
          },
        }),
      ),
    ).toBe('Knee, Shoulder · 2 movement limits');
    // A note alone is a limitation too, in the lifter's own words (Maintenance 25).
    expect(
      limitationsSummary(
        withOverrides({
          limitations: { ...base.limitations, notes: '  Left knee dislikes deep lunges ' },
        }),
      ),
    ).toBe('Left knee dislikes deep lunges');
  });

  it('names the units and the bodyweight when it is set', () => {
    expect(unitsSummary(withOverrides({ bodyweight: undefined }))).toBe('Pounds · no bodyweight');
    expect(unitsSummary(withOverrides({ units: 'kg', bodyweight: 82 }))).toBe(
      'Kilograms · 82 kg bodyweight',
    );
  });

  it('says what the cloud copy is doing, and asks for a look when it failed', () => {
    const off = {
      url: '',
      configured: false,
      syncing: false,
      pending: 0,
      lastSyncAt: null,
      lastError: null,
      linkError: null,
      deviceId: null,
      notice: null,
    };
    expect(cloudSummary(off)).toEqual({
      text: 'Off · an optional copy in a database of your own',
      attention: false,
    });
    expect(cloudSummary({ ...off, configured: true, pending: 2 }).text).toBe(
      'On · 2 changes to send',
    );
    expect(cloudSummary({ ...off, configured: true, lastError: 'Failed to fetch' })).toEqual({
      text: 'Needs a look: open for what happened',
      attention: true,
    });
    // Offline is a wait, not a failure (Maintenance 25): the copy goes on once back online.
    expect(cloudSummary({ ...off, configured: true, lastError: CLOUD_OFFLINE })).toEqual({
      text: 'On · waiting to be online',
      attention: false,
    });
    expect(
      cloudSummary({ ...off, configured: true, pending: 3, lastError: CLOUD_OFFLINE }).text,
    ).toBe('On · 3 changes to send once online');
    // A setup link whose database did not answer: never on, and still worth a look.
    expect(cloudSummary({ ...off, linkError: 'Could not reach that database.' }).attention).toBe(
      true,
    );
    // Not used while the copy waits offline for the database it has: the link is the news (the
    // third review).
    expect(
      cloudSummary({
        ...off,
        configured: true,
        lastError: CLOUD_OFFLINE,
        linkError: 'Connect to the internet to set up a different database.',
      }),
    ).toEqual({ text: 'Needs a look: open for what happened', attention: true });
  });
});
