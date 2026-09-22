import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GYM_LOCATION_ID, createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { BarcodeOverlay } from './BarcodeOverlay';

// The drawing code as the phone might meet it: not loaded yet, or failing to load.
const drawing = vi.hoisted(() => ({ encode: (): Promise<unknown> => new Promise(() => {}) }));
vi.mock('./encode', () => ({ encodeBarcode: () => drawing.encode() }));

async function openWithCode() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW, GYM_LOCATION_ID),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await handle.store.saveBarcode(GYM_LOCATION_ID, {
    image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,U1lOVEhFVElD' },
    code: { format: 'code_128', value: 'SYNTH-0001' },
  });
  render(
    <Providers store={handle.store}>
      <BarcodeOverlay />
    </Providers>,
  );
  act(() => handle.store.openBarcodeFullScreen(GYM_LOCATION_ID));
}

describe('the barcode when the drawing is slow or fails', () => {
  it('shows the picture after a short wait instead of a blank screen', async () => {
    drawing.encode = () => new Promise(() => {});
    await openWithCode();
    expect(screen.getByTestId('barcode-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('barcode-picture')).not.toBeInTheDocument();
    expect(await screen.findByTestId('barcode-picture', {}, { timeout: 3000 })).toBeVisible();
    expect(screen.queryByTestId('barcode-switch')).not.toBeInTheDocument();
  });

  it('shows the picture at once when the drawing fails', async () => {
    drawing.encode = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));
    await openWithCode();
    expect(await screen.findByTestId('barcode-picture', {}, { timeout: 500 })).toBeVisible();
  });
});
