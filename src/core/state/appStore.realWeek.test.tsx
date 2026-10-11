import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { createDraft, type ProfileDraft } from '../../features/profile/draft';
import { ScheduleEditor } from '../../features/profile/editors/ScheduleEditor';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 27, the owner's item 46: moving the schedule sets its sessions and days, and when,
 * so the real week is read afresh from there; the plan is rebuilt and the split follows. A change
 * made by hand in Settings sets the same time.
 */

describe('moving the schedule', () => {
  it('sets the sessions, the days and when, and the plan follows', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.moveSchedule(2, ['mon', 'thu']);
    const schedule = store.getSnapshot().profile!.schedule;
    expect(schedule).toMatchObject({
      weeklyFrequency: 2,
      availableDays: ['mon', 'thu'],
      since: TEST_NOW,
    });
    // The plan follows: two days a week rotate full body, upper and lower.
    expect(['full-body', 'upper', 'lower']).toContain(
      store.getSnapshot().session!.workout.templateId,
    );
  });

  it('by hand in Settings sets when, too', async () => {
    let latest: ProfileDraft = createDraft(TEST_NOW);
    function Harness() {
      const [draft, setDraft] = useState(latest);
      return (
        <ScheduleEditor
          draft={draft}
          onChange={(next) => {
            latest = next;
            setDraft(next);
          }}
        />
      );
    }
    render(<Harness />);
    expect(latest.profile.schedule.since).toBeUndefined();
    await userEvent.setup().click(screen.getByRole('radio', { name: '3' }));
    expect(latest.profile.schedule.weeklyFrequency).toBe(3);
    expect(latest.profile.schedule.since).toBeDefined();
    // The choice already made changes nothing, and starts no reading afresh (the review).
    const before = latest;
    await userEvent.setup().click(screen.getByRole('radio', { name: '3' }));
    expect(latest).toBe(before);
  });
});
