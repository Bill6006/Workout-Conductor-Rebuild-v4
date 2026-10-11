import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../../core/validation/profile';
import { Providers, createTestStore } from '../../../test/testStore';
import { pushSummary } from '../../settings/summaries';
import { createDraft, type ProfileDraft } from '../draft';
import { PushLiftEditor } from './PushLiftEditor';

/**
 * Maintenance 27, the owner's item 44: the lift to push is set in Settings: a lift, a target max
 * and an optional date. The push starts once both a lift and a target are set and keeps its start
 * while the target or date changes; another lift starts afresh once its own target is set.
 */

const NOW = '2026-09-18T12:00:00.000Z';

function Harness({
  initial,
  onDraft,
}: {
  initial: ProfileDraft;
  onDraft: (draft: ProfileDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <PushLiftEditor
      draft={draft}
      onChange={(next) => {
        setDraft(next);
        onDraft(next);
      }}
    />
  );
}

function setup(patch: Partial<UserProfile> = {}) {
  const base = createDraft(NOW);
  let latest: ProfileDraft = { ...base, profile: { ...base.profile, ...patch } };
  const { store } = createTestStore();
  render(
    <Providers store={store}>
      <Harness initial={latest} onDraft={(draft) => (latest = draft)} />
    </Providers>,
  );
  return { user: userEvent.setup(), draft: () => latest };
}

const liftSelect = () => screen.getByLabelText('Lift');
const targetField = () => screen.getByLabelText('Target max');

describe('the lift to push in Settings', () => {
  it('starts a push once a lift and a target are set', async () => {
    const { user, draft } = setup();
    expect(draft().profile.pushLift).toBeUndefined();
    await user.selectOptions(liftSelect(), 'barbell-bench-press');
    // A lift alone is no push yet.
    expect(draft().profile.pushLift).toBeUndefined();
    expect(screen.getByTestId('push-needs-target').textContent).toBe(
      'Set a target to start pushing Barbell Bench Press.',
    );
    await user.type(targetField(), '225');
    expect(draft().profile.pushLift).toMatchObject({
      exerciseId: 'barbell-bench-press',
      target: 225,
      units: 'lb',
    });
    expect(pushSummary(draft().profile)).toBe('Barbell Bench Press to 225 lb');
  });

  it('keeps its start while the target and the date change', async () => {
    const since = '2026-08-01T12:00:00.000Z';
    const { user, draft } = setup({
      pushLift: { exerciseId: 'back-squat', target: 300, units: 'lb', since },
    });
    await user.clear(targetField());
    // An emptied field is not a stop.
    expect(draft().profile.pushLift?.target).toBe(300);
    await user.type(targetField(), '315');
    expect(draft().profile.pushLift).toMatchObject({ target: 315, since });
    await user.type(screen.getByLabelText('By (optional)'), '2026-12-01');
    expect(draft().profile.pushLift?.since).toBe(since);
    expect(draft().profile.pushLift?.by?.slice(0, 4)).toBe('2026');
    expect(pushSummary(draft().profile)).toBe('Back Squat to 315 lb by Dec 1');
  });

  it('keeps the push on its lift until another lift has its own target', async () => {
    const since = '2026-08-01T12:00:00.000Z';
    const { user, draft } = setup({
      pushLift: { exerciseId: 'back-squat', target: 300, units: 'lb', since },
    });
    await user.selectOptions(liftSelect(), 'deadlift');
    expect(draft().profile.pushLift?.exerciseId).toBe('back-squat');
    expect(screen.getByTestId('push-needs-target').textContent).toBe(
      'Set a target to start pushing Deadlift. Until then you keep pushing Back Squat.',
    );
    await user.type(targetField(), '405');
    expect(draft().profile.pushLift?.exerciseId).toBe('deadlift');
    expect(draft().profile.pushLift?.since).not.toBe(since);
  });

  it('stops', async () => {
    const { user, draft } = setup({
      pushLift: {
        exerciseId: 'back-squat',
        target: 300,
        units: 'lb',
        since: '2026-08-01T12:00:00.000Z',
      },
    });
    await user.click(screen.getByTestId('push-stop'));
    expect(draft().profile.pushLift).toBeUndefined();
    expect(pushSummary(draft().profile)).toBe('None');
  });

  it('notes what Light weights means for it', async () => {
    const { user } = setup({ programStyle: 'high-rep' });
    await user.selectOptions(liftSelect(), 'barbell-bench-press');
    expect(screen.getByTestId('push-light-note').textContent).toContain(
      'Light weights builds less max strength',
    );
  });

  it('offers only lifts a push can be on', () => {
    setup();
    const options = [...(liftSelect() as HTMLSelectElement).options].map((option) => option.value);
    expect(options[0]).toBe('');
    expect(options).toContain('barbell-bench-press');
    expect(options).not.toContain('cable-curl');
    expect(options).not.toContain('pull-up');
  });
});
