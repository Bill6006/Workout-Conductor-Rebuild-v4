import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { GYM_LOCATION_ID, createDefaultLocations } from '../../core/validation/location';
import type { PickedBarcode } from '../../core/validation/placeBarcode';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

// A synthetic picture and code; nothing here is anyone's membership.
const PICKED: PickedBarcode = {
  image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,U1lOVEhFVElD' },
  code: { format: 'code_128', value: 'SYNTH-0001' },
};

async function seeded(barcode?: PickedBarcode) {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  if (barcode) await handle.store.saveBarcode(GYM_LOCATION_ID, barcode);
  return handle.store;
}

function renderApp(store: AppStore, hash = '#/today') {
  act(() => {
    window.location.hash = hash;
  });
  return render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
}

function marked(): boolean {
  const state = window.history.state as Record<string, unknown> | null;
  return state?.barcodeOverlay === true;
}

describe('the gym barcode on screen', () => {
  it('pops up drawn cleanly as the workout starts, shows the picture on request, and the X closes it', async () => {
    const store = await seeded(PICKED);
    const user = userEvent.setup();
    renderApp(store);

    await user.click(await screen.findByTestId('start-workout'));
    const overlay = await screen.findByTestId('barcode-overlay');
    expect(within(overlay).getByText('Gym')).toBeInTheDocument();
    expect(await within(overlay).findByTestId('barcode-graphic')).toHaveAttribute(
      'data-kind',
      'bars',
    );
    expect(within(overlay).getByTestId('barcode-value')).toHaveTextContent('SYNTH-0001');
    expect(marked()).toBe(true);

    await user.click(within(overlay).getByTestId('barcode-switch'));
    expect(within(overlay).getByTestId('barcode-picture')).toHaveAttribute(
      'src',
      PICKED.image.dataUrl,
    );
    expect(within(overlay).getByTestId('barcode-switch')).toHaveTextContent('Show the drawn code');

    await user.click(within(overlay).getByRole('button', { name: 'Close barcode' }));
    await waitFor(() => expect(screen.queryByTestId('barcode-overlay')).not.toBeInTheDocument());
    // The X spent the entry the barcode added, so the next Back leaves the screen as usual.
    expect(marked()).toBe(false);
    expect(store.getSnapshot().session?.status).toBe('active');
  });

  it("closes on the phone's Back without leaving the workout", async () => {
    const store = await seeded(PICKED);
    renderApp(store, '#/workout');
    act(() => store.startWorkout());
    await screen.findByTestId('barcode-overlay');
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByTestId('barcode-overlay')).not.toBeInTheDocument());
    expect(window.location.hash).toBe('#/workout');
  });

  it('opens from Today any time, and only where the place has one', async () => {
    const store = await seeded(PICKED);
    await store.setBarcodeAutoShow(GYM_LOCATION_ID, false);
    const user = userEvent.setup();
    renderApp(store);

    await user.click(await screen.findByTestId('start-workout'));
    expect(window.location.hash).toBe('#/workout');
    expect(screen.queryByTestId('barcode-overlay')).not.toBeInTheDocument();
    // Mid-workout, Today still has it one tap away.
    act(() => {
      window.location.hash = '#/today';
      window.dispatchEvent(new Event('hashchange'));
    });
    await user.click(await screen.findByTestId('barcode-open'));
    expect(await screen.findByTestId('barcode-overlay')).toBeInTheDocument();
  });

  it('offers nothing on Today at a place without a barcode', async () => {
    const store = await seeded();
    renderApp(store);
    await screen.findByTestId('start-workout');
    expect(screen.queryByTestId('barcode-open')).not.toBeInTheDocument();
  });
});

describe('adding the barcode to a place', () => {
  async function placeRow(place: string) {
    const places = await screen.findByRole('list', { name: 'Saved locations' });
    const row = within(places).getByText(place).closest('li');
    if (!row) throw new Error(`no ${place} row`);
    return row;
  }

  it('saves a picked picture on a sheet of its own, switches the pop-up off, shows it, and removes it', async () => {
    const store = await seeded();
    const user = userEvent.setup();
    renderApp(store, '#/plan');

    const gym = await placeRow('Gym');
    await user.click(within(gym).getByRole('button', { name: 'Barcode' }));
    const sheet = await screen.findByRole('dialog', { name: 'Gym barcode' });
    // Only the barcode: none of the place's equipment.
    expect(within(sheet).queryByText('Equipment here')).not.toBeInTheDocument();

    // jsdom has no barcode reader, so this is the picture-only path.
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'card.png', {
      type: 'image/png',
    });
    expect(within(sheet).getByTestId('barcode-add')).toBeInTheDocument();
    await user.upload(within(sheet).getByTestId('barcode-file'), file);
    expect(await within(sheet).findByTestId('barcode-read')).toHaveTextContent(
      'Shows as the picture you added.',
    );
    expect(store.getSnapshot().barcodes[0]).toMatchObject({ autoShow: true });
    expect(within(sheet).queryByRole('button', { name: 'Show' })).not.toBeInTheDocument();

    await user.click(
      within(sheet).getByRole('switch', { name: /Show when I start a workout here/ }),
    );
    await waitFor(() => expect(store.getSnapshot().barcodes[0]?.autoShow).toBe(false));

    // A tap on the picture shows it full screen; Escape closes that only, not the sheet under it.
    await user.click(within(sheet).getByRole('button', { name: 'Show it full screen' }));
    expect(await screen.findByTestId('barcode-picture')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('barcode-overlay')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Gym barcode' })).toBeInTheDocument();

    await user.click(within(sheet).getByTestId('barcode-remove'));
    await user.click(within(sheet).getByTestId('barcode-remove-confirm'));
    expect(await within(sheet).findByTestId('barcode-add')).toBeInTheDocument();
    expect(store.getSnapshot().barcodes).toEqual([]);

    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Gym barcode' })).not.toBeInTheDocument(),
    );
  });

  it('is not offered for Home, and the place editor stays about the place', async () => {
    const store = await seeded();
    const user = userEvent.setup();
    renderApp(store, '#/plan');
    const home = await placeRow('Home');
    expect(within(home).queryByRole('button', { name: 'Barcode' })).not.toBeInTheDocument();

    const gym = await placeRow('Gym');
    await user.click(within(gym).getByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: 'Edit Gym' });
    expect(within(editor).queryByTestId('barcode-add')).not.toBeInTheDocument();
    expect(within(editor).queryByText(/barcode/i)).not.toBeInTheDocument();
  });
});
