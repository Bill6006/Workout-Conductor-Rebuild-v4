import type { KeyValueStorage } from '../storage/localSettings';
import { parsePlaceBarcodes, type PlaceBarcode } from '../validation/placeBarcode';

/**
 * A place's barcode kept twice on the phone (Maintenance 25). Its home is the
 * phone's database (IndexedDB), which Chrome on Android can clear under storage
 * pressure while it keeps local storage, a different storage engine: it did so
 * on the owner's phone, and the cloud copy brought everything back but the
 * barcode, which never goes there. So each barcode is also kept in local
 * storage: its place, the code read from it, its switch and its times, and its
 * picture when that fits. Local storage is small and shared by every app on
 * this origin (and by the workout under way), so pictures there have a budget:
 * a big one is kept as a smaller copy, or not at all, and the code alone still
 * draws the barcode for the desk.
 *
 * Every change touches one barcode's entry and leaves the others as they are,
 * so a window opened before another one's change never writes its old list
 * back over it (the tenth review).
 *
 * Like the barcode itself it stays on this phone: never synced, never in a
 * backup or an export.
 */
export const BARCODE_MIRROR_KEY = 'wc.v1.barcodes';

/** The longest picture kept here, as a data URL: about 150 KB of picture. */
export const MIRROR_PICTURE_MAX = 200_000;
/** All the pictures kept here together, so the shared local storage keeps its room. */
export const MIRROR_PICTURES_TOTAL = 400_000;

export type MirrorPicture = NonNullable<PlaceBarcode['image']>;
/** What the second copy holds of a barcode: its picture, its code alone, or nothing usable. */
export type MirrorCopy = 'picture' | 'code' | 'none';

/** The barcodes kept in local storage; anything unreadable there is left out. */
export function readBarcodeMirror(storage: KeyValueStorage): PlaceBarcode[] {
  let raw: string | null;
  try {
    raw = storage.getItem(BARCODE_MIRROR_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsePlaceBarcodes(parsed) : [];
  } catch {
    return [];
  }
}

/** The picture a barcode keeps in local storage: its own when small, else the smaller copy. */
export function mirrorPicture(
  barcode: PlaceBarcode,
  smaller: MirrorPicture | null | undefined,
): MirrorPicture | undefined {
  const own = barcode.image;
  if (own && own.dataUrl.length <= MIRROR_PICTURE_MAX) return own;
  if (smaller && smaller.dataUrl.length <= MIRROR_PICTURE_MAX) return smaller;
  return undefined;
}

function entry(barcode: PlaceBarcode, picture: MirrorPicture | undefined): PlaceBarcode {
  const rest = { ...barcode };
  delete rest.image;
  return picture ? { ...rest, image: picture } : rest;
}

function write(storage: KeyValueStorage, entries: readonly PlaceBarcode[]): boolean {
  try {
    if (entries.length === 0) {
      storage.removeItem(BARCODE_MIRROR_KEY);
      return storage.getItem(BARCODE_MIRROR_KEY) === null;
    }
    const value = JSON.stringify(entries);
    storage.setItem(BARCODE_MIRROR_KEY, value);
    return storage.getItem(BARCODE_MIRROR_KEY) === value;
  } catch {
    return false;
  }
}

/** What the second copy now holds of this barcode, read back. */
export function mirrorCopyOf(storage: KeyValueStorage, barcode: PlaceBarcode): MirrorCopy {
  const kept = readBarcodeMirror(storage).find((item) => item.id === barcode.id);
  if (!kept || kept.updatedAt !== barcode.updatedAt) return 'none';
  return kept.image ? 'picture' : kept.code ? 'code' : 'none';
}

/**
 * Keeps this barcode's entry, leaving every other entry as it is. The picture is its own when
 * small, else `smaller`, else the one already kept for this same version, within the budget;
 * without a picture its code stands, and with neither nothing is kept for it (an older entry of
 * the same place goes, so a clearing never brings back a barcode that was replaced). Returns
 * what is kept, read back.
 */
export function keepInMirror(
  storage: KeyValueStorage,
  barcode: PlaceBarcode,
  smaller?: MirrorPicture,
): MirrorCopy {
  const entries = readBarcodeMirror(storage);
  const existing = entries.find((item) => item.id === barcode.id);
  const others = entries.filter((item) => item.id !== barcode.id);
  const kept =
    smaller ?? (existing && existing.updatedAt === barcode.updatedAt ? existing.image : undefined);
  let picture = mirrorPicture(barcode, kept);
  const othersPictures = others.reduce((sum, item) => sum + (item.image?.dataUrl.length ?? 0), 0);
  if (picture && othersPictures + picture.dataUrl.length > MIRROR_PICTURES_TOTAL) {
    picture = undefined;
  }
  if (!picture && !barcode.code) {
    return write(storage, others) ? 'none' : mirrorCopyOf(storage, barcode);
  }
  if (write(storage, [...others, entry(barcode, picture)])) return picture ? 'picture' : 'code';
  // Short of room: the picture goes before the code does.
  if (picture && barcode.code && write(storage, [...others, entry(barcode, undefined)])) {
    return 'code';
  }
  return mirrorCopyOf(storage, barcode);
}

/** Removes this barcode's entry, leaving the others; true once it is gone, read back. */
export function dropFromMirror(storage: KeyValueStorage, id: string): boolean {
  const entries = readBarcodeMirror(storage);
  if (!entries.some((item) => item.id === id)) return true;
  write(
    storage,
    entries.filter((item) => item.id !== id),
  );
  return !readBarcodeMirror(storage).some((item) => item.id === id);
}
