import { useRef, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Toggle } from '../../components/Form/Toggle';
import { Sheet } from '../../components/Sheet/Sheet';
import { useToast } from '../../components/Toast/useToast';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import type { LocationProfile } from '../../core/validation/location';
import { barcodeFromFile } from './barcodeFile';
import styles from './Barcode.module.css';
import formStyles from '../../components/Form/Form.module.css';

/**
 * A place's membership barcode on a sheet of its own, apart from the place's
 * equipment. It saves the moment a picture is picked, and it stays on this phone.
 */
export function PlaceBarcodeSheet({
  location,
  onClose,
}: {
  location: LocationProfile;
  onClose: () => void;
}) {
  const store = useAppStore();
  const toast = useToast();
  const barcode = useAppSelector((state) =>
    state.barcodes.find((item) => item.locationId === location.id),
  );
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const picked = await barcodeFromFile(file);
      await store.saveBarcode(location.id, picked);
      toast.show('Barcode saved on this phone', 'success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That picture could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.show(done, 'info');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const choose = () => input.current?.click();

  return (
    <Sheet
      open
      title={`${location.name} barcode`}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className={styles.section}>
        <p className={styles.note}>
          {barcode
            ? 'Stays on this phone.'
            : "A screenshot from your gym's app works best. It stays on this phone."}
        </p>
        {barcode ? (
          <div className={styles.section} data-testid="barcode-section">
            {/* The picture is the preview: a tap shows it full screen, as the desk sees it. */}
            <button
              type="button"
              className={styles.thumbButton}
              onClick={() => store.openBarcode(location.id)}
              aria-label="Show it full screen"
              data-testid="barcode-thumb"
            >
              <img
                className={styles.thumb}
                src={barcode.image.dataUrl}
                alt={`${location.name} barcode picture`}
              />
            </button>
            <p className={styles.note} data-testid="barcode-read">
              {barcode.code
                ? 'Code read: it shows redrawn, sharp and full width.'
                : 'Shows as the picture you added.'}
            </p>
            <Toggle
              label="Show when I start a workout here"
              checked={barcode.autoShow}
              onChange={(autoShow) =>
                void run(
                  () => store.setBarcodeAutoShow(location.id, autoShow),
                  autoShow ? 'It will show at Start' : 'It will stay closed at Start',
                )
              }
            />
            <div className={styles.actions}>
              {confirming ? (
                <>
                  <Button
                    variant="danger"
                    onClick={() =>
                      void run(() => store.removeBarcode(location.id), 'Barcode removed')
                    }
                    disabled={busy}
                    data-testid="barcode-remove-confirm"
                  >
                    Remove it
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                    Keep
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={choose}
                    disabled={busy}
                    data-testid="barcode-replace"
                  >
                    Replace
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirming(true)}
                    disabled={busy}
                    data-testid="barcode-remove"
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={choose} disabled={busy} data-testid="barcode-add">
            {busy ? 'Reading the picture…' : 'Add a barcode'}
          </Button>
        )}
        {error ? (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        ) : null}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          aria-label="Choose a barcode picture"
          data-testid="barcode-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            setConfirming(false);
            void pick(file);
          }}
        />
      </div>
    </Sheet>
  );
}
