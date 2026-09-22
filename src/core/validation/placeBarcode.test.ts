import { describe, expect, it } from 'vitest';
import { PlaceBarcodeSchema, barcodeIdFor, parsePlaceBarcodes } from './placeBarcode';

const AT = '2026-09-22T12:00:00.000Z';

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: barcodeIdFor('gym'),
    locationId: 'gym',
    image: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
    code: { format: 'code_128', value: 'SYNTH-0001' },
    autoShow: true,
    addedAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

describe('a saved place barcode', () => {
  it('reads back with its picture, its code, and the pop-up choice', () => {
    expect(PlaceBarcodeSchema.parse(stored())).toMatchObject({
      locationId: 'gym',
      code: { format: 'code_128', value: 'SYNTH-0001' },
      autoShow: true,
    });
  });

  it('keeps the barcode when a code in it cannot be used, losing only the drawn version', () => {
    const parsed = PlaceBarcodeSchema.parse(stored({ code: { format: 'maxicode', value: 'X' } }));
    expect(parsed.code).toBeUndefined();
    expect(parsed.image.dataUrl).toMatch(/^data:image\//);
  });

  it('never takes a picture that is not an image', () => {
    const script = stored({ image: { mimeType: 'image/png', dataUrl: 'javascript:alert(1)' } });
    expect(PlaceBarcodeSchema.safeParse(script).success).toBe(false);
    const html = stored({ image: { mimeType: 'text/html', dataUrl: 'data:image/png;base64,AA' } });
    expect(PlaceBarcodeSchema.safeParse(html).success).toBe(false);
  });

  it('loads only well-formed rows filed under their own place', () => {
    const rows = [
      stored(),
      stored({ id: barcodeIdFor('home'), locationId: 'gym' }),
      stored({ id: barcodeIdFor('hotel'), locationId: 'hotel', autoShow: 'yes' }),
      { nonsense: true },
    ];
    expect(parsePlaceBarcodes(rows).map((row) => row.id)).toEqual(['barcode:gym']);
  });
});
