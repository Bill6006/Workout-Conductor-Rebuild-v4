import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { BarcodeOverlay } from './BarcodeOverlay';
import { PlaceBarcodeSheet } from './PlaceBarcodeSheet';

/**
 * The barcode over whichever screen is showing: its popup (from Plan, from
 * Today's Show barcode, or at Start), and above that the full-screen view the
 * popup opens.
 */
export function BarcodeLayer() {
  const store = useAppStore();
  const location = useAppSelector((state) =>
    state.barcodeSheet === null
      ? undefined
      : state.locations.find((item) => item.id === state.barcodeSheet),
  );
  return (
    <>
      {location ? (
        <PlaceBarcodeSheet
          key={location.id}
          location={location}
          onClose={() => store.closeBarcodeSheet()}
        />
      ) : null}
      <BarcodeOverlay />
    </>
  );
}
