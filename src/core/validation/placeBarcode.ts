import { z } from 'zod';

/**
 * A place's membership barcode, shown full screen at the desk. It stays on this
 * phone: kept in the device-only store, never synced to the cloud copy and never
 * in a backup (Maintenance 18). The picture is kept as it was added; when the
 * phone could read the code from it, the code is kept too and the app draws it
 * cleanly, which a scanner reads more easily than a photo of a key tag.
 */

/** The formats the app can draw itself; anything else is shown as the picture it came from. */
export const BARCODE_FORMATS = [
  'code_128',
  'code_39',
  'code_93',
  // Common on membership key tags and library-style cards.
  'codabar',
  'itf',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'qr_code',
] as const;
export type BarcodeFormat = (typeof BARCODE_FORMATS)[number];

/** A screenshot or a photo, up to this size. */
export const BARCODE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export const BarcodeCodeSchema = z.looseObject({
  format: z.enum(BARCODE_FORMATS),
  value: z.string().min(1).max(512),
});
export type BarcodeCode = z.infer<typeof BarcodeCodeSchema>;

export const PlaceBarcodeSchema = z.looseObject({
  id: z.string().min(1),
  locationId: z.string().min(1),
  image: z.looseObject({
    mimeType: z.string().regex(/^image\//),
    dataUrl: z.string().regex(/^data:image\//),
  }),
  /** Advisory: a code this copy cannot use costs the drawn version, never the barcode. */
  code: BarcodeCodeSchema.optional().catch(undefined),
  /** Pops up when a workout starts at this place. */
  autoShow: z.boolean(),
  addedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PlaceBarcode = z.infer<typeof PlaceBarcodeSchema>;

export const BARCODE_ID_PREFIX = 'barcode:';

export function barcodeIdFor(locationId: string): string {
  return `${BARCODE_ID_PREFIX}${locationId}`;
}

/** What a picked picture comes to: the picture, and the code when the phone could read one. */
export interface PickedBarcode {
  image: { mimeType: string; dataUrl: string };
  code?: BarcodeCode;
}

export function parsePlaceBarcodes(raw: readonly unknown[]): PlaceBarcode[] {
  return raw
    .map((item) => PlaceBarcodeSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((barcode) => barcode.id === barcodeIdFor(barcode.locationId));
}
