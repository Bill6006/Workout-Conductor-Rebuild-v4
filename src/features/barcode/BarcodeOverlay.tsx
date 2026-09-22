import { useEffect, useState, type ReactNode } from 'react';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import type { PlaceBarcode } from '../../core/validation/placeBarcode';
import { BarcodeGraphicSvg } from './BarcodeGraphic';
import { encodeBarcode, type BarcodeGraphic } from './encode';
import { useBackCloses } from './useBackCloses';
import styles from './Barcode.module.css';

/**
 * A place's barcode, full screen on white for the scanner at the desk, opened
 * from its popup. It keeps the screen awake while it is up (a browser cannot
 * raise the brightness, so a plain white page and full contrast do that job),
 * and one tap on the X goes back to the popup.
 */
export function BarcodeOverlay() {
  const store = useAppStore();
  const open = useAppSelector((state) => state.barcodeFullScreen);
  const barcodes = useAppSelector((state) => state.barcodes);
  const locations = useAppSelector((state) => state.locations);
  const barcode = open ? barcodes.find((item) => item.locationId === open) : undefined;
  if (!barcode) return null;
  const place = locations.find((location) => location.id === barcode.locationId)?.name ?? 'Gym';
  // Keyed on the save time, so a replaced barcode never shows the old drawing for a moment.
  return (
    <BarcodeView
      key={barcode.updatedAt}
      barcode={barcode}
      place={place}
      onClose={() => store.closeBarcodeFullScreen()}
    />
  );
}

function useWakeLock(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;
    const request = () => {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (cancelled) void lock.release().catch(() => undefined);
          else sentinel = lock;
        })
        // Refused (no user gesture, low battery): the screen may dim, and the code still shows.
        .catch(() => undefined);
    };
    request();
    // The browser drops the lock when the page is hidden; take it again on the way back.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}

/** How long the drawing is waited on before the picture shows instead. */
const DRAWING_WAIT_MS = 1500;

function BarcodeView({
  barcode,
  place,
  onClose,
}: {
  barcode: PlaceBarcode;
  place: string;
  onClose: () => void;
}) {
  const code = barcode.code;
  const [graphic, setGraphic] = useState<BarcodeGraphic | null>(null);
  // Without a read code the picture is all there is; with one, the drawing comes first.
  const [showPicture, setShowPicture] = useState(!code);
  useWakeLock();
  const close = useBackCloses('barcodeOverlay', onClose);

  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    // A drawing slow to arrive is not waited on: the picture shows, and the switch offers the
    // drawing once it is ready, so the screen never changes under the scanner by itself.
    const slow = window.setTimeout(() => {
      if (live) setShowPicture(true);
    }, DRAWING_WAIT_MS);
    encodeBarcode(code)
      .then((drawn) => {
        if (!live) return;
        if (drawn) setGraphic(drawn);
        else setShowPicture(true);
      })
      .catch(() => {
        if (live) setShowPicture(true);
      })
      .finally(() => window.clearTimeout(slow));
    return () => {
      live = false;
      window.clearTimeout(slow);
    };
  }, [code]);

  useEffect(() => {
    // Caught before a sheet underneath sees it, so Escape closes only the barcode.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  const drawn = graphic !== null && code !== undefined && !showPicture;
  let body: ReactNode = null;
  if (drawn) {
    body = (
      <>
        <BarcodeGraphicSvg graphic={graphic} label={`${place} barcode ${code.value}`} />
        <p className={styles.value} data-testid="barcode-value">
          {code.value}
        </p>
      </>
    );
  } else if (showPicture) {
    body = (
      <img
        className={styles.picture}
        src={barcode.image.dataUrl}
        alt={`${place} barcode`}
        data-testid="barcode-picture"
      />
    );
  }
  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${place} barcode`}
      data-testid="barcode-overlay"
    >
      <div className={styles.top}>
        <span className={styles.place}>{place}</span>
        <button
          type="button"
          className={styles.close}
          onClick={close}
          aria-label="Close barcode"
          data-testid="barcode-close"
        >
          ×
        </button>
      </div>
      <div className={styles.body} aria-busy={body === null}>
        {body}
      </div>
      {graphic !== null && code ? (
        <button
          type="button"
          className={styles.switch}
          onClick={() => setShowPicture((current) => !current)}
          data-testid="barcode-switch"
        >
          {showPicture ? 'Show the drawn code' : 'Show the picture'}
        </button>
      ) : null}
    </div>
  );
}
