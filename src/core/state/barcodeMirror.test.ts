import { describe, expect, it } from 'vitest';
import { createMemoryStorage, type KeyValueStorage } from '../storage/localSettings';
import { barcodeIdFor, type PlaceBarcode } from '../validation/placeBarcode';
import {
  BARCODE_MIRROR_KEY,
  MIRROR_PICTURE_MAX,
  MIRROR_PICTURES_TOTAL,
  dropFromMirror,
  keepInMirror,
  mirrorCopyOf,
  mirrorPicture,
  readBarcodeMirror,
} from './barcodeMirror';

/** Maintenance 25: the barcode's second copy, in local storage. Synthetic pictures and codes. */

const AT = '2026-09-02T12:00:00.000Z';
const LATER = '2026-09-03T12:00:00.000Z';
const SMALL = { mimeType: 'image/png', dataUrl: 'data:image/png;base64,U01BTEw=' };
const BIG = {
  mimeType: 'image/png',
  dataUrl: `data:image/png;base64,${'B'.repeat(MIRROR_PICTURE_MAX)}`,
};
const SMALLER = { mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,U01BTExFUg==' };
const CODE = (place: string) => ({ format: 'code_128' as const, value: `SYNTH-${place}` });

function barcode(place: string, overrides: Partial<PlaceBarcode> = {}): PlaceBarcode {
  return {
    id: barcodeIdFor(place),
    locationId: place,
    image: SMALL,
    code: CODE(place),
    autoShow: true,
    addedAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

/** Local storage with room for this many characters, like a browser's quota. */
function roomFor(characters: number): KeyValueStorage {
  const inner = createMemoryStorage();
  return {
    getItem: (key) => inner.getItem(key),
    removeItem: (key) => inner.removeItem(key),
    setItem: (key, value) => {
      if (value.length > characters) throw new DOMException('full', 'QuotaExceededError');
      inner.setItem(key, value);
    },
  };
}

const ids = (storage: KeyValueStorage) =>
  readBarcodeMirror(storage)
    .map((item) => item.locationId)
    .sort();

describe('the barcode’s second copy', () => {
  it('keeps a small picture as it is, a big one as its smaller copy, else none', () => {
    expect(mirrorPicture(barcode('gym'), undefined)).toEqual(SMALL);
    expect(mirrorPicture(barcode('gym', { image: BIG }), SMALLER)).toEqual(SMALLER);
    expect(mirrorPicture(barcode('gym', { image: BIG }), undefined)).toBeUndefined();
    expect(mirrorPicture(barcode('gym', { image: BIG }), BIG)).toBeUndefined();
  });

  it('keeps one barcode’s entry at a time and leaves every other entry as it is', () => {
    const storage = createMemoryStorage();
    expect(keepInMirror(storage, barcode('gym'))).toBe('picture');
    expect(keepInMirror(storage, barcode('work'))).toBe('picture');
    expect(ids(storage)).toEqual(['gym', 'work']);
    // A window that never saw Work's barcode switches Gym's: Work's entry stays (the tenth review).
    expect(keepInMirror(storage, barcode('gym', { autoShow: false, updatedAt: LATER }))).toBe(
      'picture',
    );
    expect(ids(storage)).toEqual(['gym', 'work']);
    expect(readBarcodeMirror(storage).find((item) => item.locationId === 'gym')?.autoShow).toBe(
      false,
    );
    // Removing one leaves the other, and says when it is gone.
    expect(dropFromMirror(storage, barcodeIdFor('gym'))).toBe(true);
    expect(ids(storage)).toEqual(['work']);
    expect(dropFromMirror(storage, barcodeIdFor('work'))).toBe(true);
    expect(storage.getItem(BARCODE_MIRROR_KEY)).toBeNull();
  });

  it('keeps a smaller copy for the same version, and drops a replaced version’s picture', () => {
    const storage = createMemoryStorage();
    const big = barcode('gym', { image: BIG });
    expect(keepInMirror(storage, big)).toBe('code');
    expect(keepInMirror(storage, big, SMALLER)).toBe('picture');
    // Written again for the same version, the smaller copy stays.
    expect(keepInMirror(storage, big)).toBe('picture');
    expect(mirrorCopyOf(storage, big)).toBe('picture');
    // A new picture: the old smaller copy is not this barcode any more.
    const replaced = barcode('gym', { image: BIG, updatedAt: LATER });
    expect(keepInMirror(storage, replaced)).toBe('code');
    expect(readBarcodeMirror(storage)[0]?.image).toBeUndefined();
  });

  it('keeps nothing for a big picture with no code, and removes an older entry of that place', () => {
    const storage = createMemoryStorage();
    keepInMirror(storage, barcode('gym'));
    const bare = barcode('gym', { image: BIG, code: undefined, updatedAt: LATER });
    delete bare.code;
    expect(keepInMirror(storage, bare)).toBe('none');
    expect(readBarcodeMirror(storage)).toEqual([]);
    expect(mirrorCopyOf(storage, bare)).toBe('none');
  });

  it('keeps all its pictures within a budget, so the shared local storage keeps its room', () => {
    const storage = createMemoryStorage();
    const half = (char: string) => ({
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${char.repeat(MIRROR_PICTURES_TOTAL / 2 - 30)}`,
    });
    expect(keepInMirror(storage, barcode('a', { image: half('A') }))).toBe('picture');
    expect(keepInMirror(storage, barcode('b', { image: half('B') }))).toBe('picture');
    // A third would pass the budget: its code alone is kept.
    expect(keepInMirror(storage, barcode('c', { image: half('C') }))).toBe('code');
    expect((storage.getItem(BARCODE_MIRROR_KEY) ?? '').length).toBeLessThan(
      MIRROR_PICTURES_TOTAL + 2000,
    );
  });

  it('short of room keeps the code without the picture, and says when nothing could be kept', () => {
    const tight = roomFor(600);
    const roomy = barcode('gym', {
      image: { ...SMALL, dataUrl: `${SMALL.dataUrl}${'C'.repeat(800)}` },
    });
    expect(keepInMirror(tight, roomy)).toBe('code');
    expect(readBarcodeMirror(tight)[0]?.code?.value).toBe('SYNTH-gym');
    expect(keepInMirror(roomFor(10), roomy)).toBe('none');
  });

  it('reads nothing from a copy it cannot parse', () => {
    const storage = createMemoryStorage();
    storage.setItem(BARCODE_MIRROR_KEY, '{not json');
    expect(readBarcodeMirror(storage)).toEqual([]);
    storage.setItem(BARCODE_MIRROR_KEY, JSON.stringify([{ id: 'x' }, barcode('gym')]));
    expect(ids(storage)).toEqual(['gym']);
  });
});
