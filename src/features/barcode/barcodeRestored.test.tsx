import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { BARCODE_MIRROR_KEY } from '../../core/state/barcodeMirror';
import { GYM_LOCATION_ID, createDefaultLocations } from '../../core/validation/location';
import { barcodeIdFor } from '../../core/validation/placeBarcode';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 25: a barcode brought back from the phone's second copy without its picture (one too
 * big to keep there) still shows at Start: drawn from its read code, in the popup and full screen.
 * The code is synthetic.
 */

describe('a barcode brought back as its code alone', () => {
  it('is drawn in the popup and full screen, and says what came back', async () => {
    const handle = createTestStore();
    // Only the second copy has it, without a picture: the database lost it.
    handle.storage.setItem(
      BARCODE_MIRROR_KEY,
      JSON.stringify([
        {
          id: barcodeIdFor(GYM_LOCATION_ID),
          locationId: GYM_LOCATION_ID,
          code: { format: 'code_128', value: 'SYNTH-0003' },
          autoShow: true,
          addedAt: TEST_NOW,
          updatedAt: TEST_NOW,
        },
      ]),
    );
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={handle.store}>
        <App />
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('start-workout'));
    const sheet = await screen.findByRole('dialog', { name: 'Gym barcode' });
    expect(within(sheet).getByTestId('barcode-read')).toHaveTextContent(
      'Brought back as the code read from your picture. Tap it for full screen.',
    );
    expect(within(sheet).getByTestId('barcode-restored')).toHaveTextContent(
      "Brought back from this phone's second copy after the browser cleared its storage.",
    );
    expect(within(sheet).queryByRole('img', { name: /picture/ })).toBeNull();
    expect(await within(sheet).findByTestId('barcode-graphic')).toHaveAttribute(
      'data-kind',
      'bars',
    );

    await user.click(within(sheet).getByRole('button', { name: 'Show it full screen' }));
    const overlay = await screen.findByTestId('barcode-overlay');
    expect(await within(overlay).findByTestId('barcode-graphic')).toBeInTheDocument();
    expect(within(overlay).getByTestId('barcode-value')).toHaveTextContent('SYNTH-0003');
    // No picture to switch to.
    expect(within(overlay).queryByTestId('barcode-switch')).toBeNull();
    expect(within(overlay).queryByTestId('barcode-picture')).toBeNull();
  });
});
