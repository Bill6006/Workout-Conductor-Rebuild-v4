import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../../core/validation/location';
import { createDefaultProfile } from '../../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../../test/testStore';
import { draftFromState, type ProfileDraft } from '../draft';
import { UnitsEditor } from './UnitsEditor';

/**
 * The editor over a draft, as Settings holds it, for a lifter saved at 180 lb (or with none
 * saved); Leave takes the editor away, as closing Settings does.
 */
async function setup(bodyweight: number | null = 180, autosaves = true) {
  const handle = createTestStore({ minOverlayMs: 0 });
  await handle.store.hydrate();
  const profile = { ...createDefaultProfile(TEST_NOW), units: 'lb' as const };
  await handle.store.completeOnboarding(
    bodyweight === null ? profile : { ...profile, bodyweight },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const state = handle.store.getSnapshot();
  const drafts: ProfileDraft[] = [];
  function Harness() {
    const [draft, setDraft] = useState(draftFromState(state.profile!, state.locations));
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(false)}>
          Leave
        </button>
        {open ? (
          <UnitsEditor
            draft={draft}
            onChange={(next) => {
              drafts.push(next);
              setDraft(next);
            }}
            autosaves={autosaves}
          />
        ) : null}
      </>
    );
  }
  render(
    <Providers store={handle.store}>
      <Harness />
    </Providers>,
  );
  const latest = () => drafts[drafts.length - 1]?.profile.bodyweight;
  const latestUnits = () => drafts[drafts.length - 1]?.profile.units;
  return { user: userEvent.setup(), drafts, latest, latestUnits, store: handle.store };
}

async function typeBodyweight(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText(/Bodyweight/);
  await user.clear(field);
  await user.type(field, value);
}

describe('UnitsEditor: a bodyweight that looks like a slip (Maintenance 26, item 40)', () => {
  it('holds it back from the save and asks once the typing pauses', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '1800');
    expect(latest()).not.toBe(1800);
    expect(screen.getByLabelText(/Bodyweight/)).toHaveValue(1800);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "1800 lb is outside a bodyweight's usual range (66 to 660 lb).",
    );
  });

  it('keeps it with one tap', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '240');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '240 lb is far from your saved bodyweight (180 lb).',
    );
    await user.click(screen.getByTestId('slip-keep'));
    expect(latest()).toBe(240);
    expect(screen.queryByTestId('slip-question')).toBeNull();
  });

  it('changes it: the field again, and a plausible number saves as it always has', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '1800');
    await screen.findByRole('alert');
    await user.click(screen.getByTestId('slip-change'));
    expect(screen.getByLabelText(/Bodyweight/)).toHaveFocus();
    await typeBodyweight(user, '182');
    expect(latest()).toBe(182);
    expect(screen.queryByTestId('slip-question')).toBeNull();
  });
});

describe('UnitsEditor after the review of item 40', () => {
  it('keeps asking about a held number when an emptied field is saved meanwhile', async () => {
    const { user, latest, store } = await setup();
    await typeBodyweight(user, '240');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '240 lb is far from your saved bodyweight (180 lb).',
    );
    // The field passed through empty on the way, and Settings saved that a moment later.
    const without = { ...store.getSnapshot().profile! };
    delete without.bodyweight;
    await act(async () => {
      await store.saveProfile(without);
    });
    expect(store.getSnapshot().profile?.bodyweight).toBeUndefined();
    expect(screen.getByRole('alert')).toHaveTextContent('240 lb is far from');
    await user.click(screen.getByTestId('slip-keep'));
    expect(latest()).toBe(240);
  });

  it('saves nothing typed on the way while it asks: 165 on the way to 1650', async () => {
    const { user, drafts, latest } = await setup();
    await typeBodyweight(user, '1650');
    expect(drafts.some((draft) => draft.profile.bodyweight === 165)).toBe(true);
    expect(latest()).toBe(180);
    await screen.findByRole('alert');
  });

  it('judges a change of a quarter in the units shown, the confirmed one converted: 82 kg after 180 lb', async () => {
    const { user, latest, latestUnits } = await setup();
    await user.click(screen.getByRole('radio', { name: 'Kilograms (kg)' }));
    await typeBodyweight(user, '82');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(latest()).toBe(82);
    expect(latestUnits()).toBe('kg');
    // 180 typed in kilograms is far from the 82 kg confirmed at that pause: asked (the re-check;
    // the fourth pass: a number the typing paused on is confirmed, as Settings saves it).
    await typeBodyweight(user, '180');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '180 kg is far from your saved bodyweight (82 kg).',
    );
  });

  it('keeps the bodyweight the field had while it asks after a units switch, never none', async () => {
    const { user, latest, store } = await setup();
    await user.click(screen.getByRole('radio', { name: 'Kilograms (kg)' }));
    // The draft shows 180 in kilograms (the switch does not convert); a digit more is a slip.
    await user.type(screen.getByLabelText(/Bodyweight/), '0');
    expect(await screen.findByRole('alert')).toHaveTextContent('1800 kg');
    expect(latest()).toBe(180);
    expect(store.getSnapshot().profile?.bodyweight).toBe(180);
  });

  it('asks again only once the typing pauses, after Change it', async () => {
    const { user } = await setup();
    await typeBodyweight(user, '240');
    await screen.findByRole('alert');
    await user.click(screen.getByTestId('slip-change'));
    await typeBodyweight(user, '240');
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent('240 lb is far from');
  });

  it('lets a held number in with the units that make it plausible: 55 typed in lb, then kg', async () => {
    const { user, latest, latestUnits } = await setup(null);
    await typeBodyweight(user, '55');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "55 lb is outside a bodyweight's usual range (66 to 660 lb).",
    );
    await user.click(screen.getByRole('radio', { name: 'Kilograms (kg)' }));
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(latest()).toBe(55);
    expect(latestUnits()).toBe('kg');
  });

  it('keeps asking after a switch when the number is still far from the one saved, converted', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '55');
    await screen.findByRole('alert');
    await user.click(screen.getByRole('radio', { name: 'Kilograms (kg)' }));
    // Named as it was saved, with what it comes to in the units shown (the seventh pass).
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '55 kg is far from your saved bodyweight (180 lb, about 81.6 kg).',
    );
    expect(latest()).toBe(180);
  });

  it('judges the next change against a bodyweight a units switch let in', async () => {
    const { user, latest } = await setup(130);
    await typeBodyweight(user, '55');
    await screen.findByRole('alert');
    await user.click(screen.getByRole('radio', { name: 'Kilograms (kg)' }));
    expect(latest()).toBe(55);
    // 70 is more than a quarter over the 55 kg that stands, under it from 130 lb (59 kg): asked,
    // and named by the one let in (the eighth pass: 130 lb was read).
    await typeBodyweight(user, '70');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '70 kg is far from your saved bodyweight (55 kg).',
    );
  });

  it('keeps, while it asks, the bodyweight the field had as the typing began', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '182');
    await user.tab();
    expect(latest()).toBe(182);
    await typeBodyweight(user, '1820');
    await screen.findByRole('alert');
    expect(latest()).toBe(182);
  });

  it('goes back, while it asks, to a plausible number the typing paused on', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '182');
    // Settings saves it at this pause: the question about 1820 keeps it (the third pass).
    await new Promise((resolve) => setTimeout(resolve, 600));
    await typeBodyweight(user, '1820');
    await screen.findByRole('alert');
    expect(latest()).toBe(182);
  });

  it('never goes back to a number typed on the way: 165 on the way to 1650 is no pause', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '1650');
    await screen.findByRole('alert');
    await new Promise((resolve) => setTimeout(resolve, 600));
    await user.type(screen.getByLabelText(/Bodyweight/), '0');
    expect(latest()).toBe(180);
  });

  it('goes back to no emptied field: the bodyweight saved stays while it asks', async () => {
    const { user, latest } = await setup();
    const field = screen.getByLabelText(/Bodyweight/);
    await user.clear(field);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await user.type(field, '1800');
    await screen.findByRole('alert');
    expect(latest()).toBe(180);
  });

  it('confirms a number the typing paused on: the next change is judged against it', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '225');
    await new Promise((resolve) => setTimeout(resolve, 600));
    await typeBodyweight(user, '235');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(latest()).toBe(235);
  });

  it('judges setup by a number the typing paused on too, as the one entered', async () => {
    const { user } = await setup(null, false);
    await typeBodyweight(user, '150');
    await new Promise((resolve) => setTimeout(resolve, 600));
    await typeBodyweight(user, '205');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '205 lb is far from the bodyweight you entered (150 lb).',
    );
  });

  it('names the bodyweight that stands in setup: one paused on after the one it opened with', async () => {
    const { user } = await setup(180, false);
    await typeBodyweight(user, '220');
    await new Promise((resolve) => setTimeout(resolve, 600));
    await typeBodyweight(user, '280');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '280 lb is far from the bodyweight you entered (220 lb).',
    );
  });

  it('calls a bodyweight typed in setup the one entered, not saved', async () => {
    const { user } = await setup(null, false);
    await typeBodyweight(user, '150');
    await user.tab();
    await typeBodyweight(user, '205');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '205 lb is far from the bodyweight you entered (150 lb).',
    );
  });

  it('judges the next change against a number kept', async () => {
    const { user, latest } = await setup();
    await typeBodyweight(user, '240');
    await screen.findByRole('alert');
    await user.click(screen.getByTestId('slip-keep'));
    await typeBodyweight(user, '245');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByTestId('slip-question')).toBeNull();
    expect(latest()).toBe(245);
  });

  it('offers no Keep for more than a profile keeps', async () => {
    const { user } = await setup();
    await typeBodyweight(user, '1800');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A bodyweight can be at most 1000 lb.',
    );
    expect(screen.queryByTestId('slip-keep')).toBeNull();
    expect(screen.getByTestId('slip-change')).toHaveAccessibleDescription(/1800 lb is outside/);
  });

  it('says so when it is left with a question open', async () => {
    const { user } = await setup();
    await typeBodyweight(user, '1800');
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() =>
      expect(
        screen.getByText('Bodyweight stays 180 lb: 1800 lb was not kept.'),
      ).toBeInTheDocument(),
    );
  });
});
