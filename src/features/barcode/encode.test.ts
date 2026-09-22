import { describe, expect, it } from 'vitest';
import { encodeBarcode, type BarcodeGraphic } from './encode';

// Module patterns from the Code 128 symbol table (ISO/IEC 15417), written out by hand.
const START_B = '11010010000';
const STOP = '1100011101011';
const A = '10100011000';
const B = '10001011000';
const C = '10001000110';
const CHECK_1 = '11001101100';
// Code 39's start and stop character, *, as narrow-wide bars and spaces (wide = 3 modules).
const STAR = '100010111011101';

function bars(graphic: BarcodeGraphic | null): string {
  if (graphic?.kind !== 'bars') throw new Error(`expected bars, got ${graphic?.kind ?? 'null'}`);
  return graphic.modules;
}

describe('drawing a read barcode', () => {
  it('draws Code 128 symbol for symbol, check character and stop included', async () => {
    // Check: (104 + 33×1 + 34×2 + 35×3) mod 103 = 310 mod 103 = 1.
    expect(bars(await encodeBarcode({ format: 'code_128', value: 'ABC' }))).toBe(
      `${START_B}${A}${B}${C}${CHECK_1}${STOP}`,
    );
  });

  it('draws EAN-13 at its 95 modules with the guard bars where a scanner looks for them', async () => {
    const modules = bars(await encodeBarcode({ format: 'ean_13', value: '5901234123457' }));
    expect(modules).toHaveLength(95);
    expect(modules.slice(0, 3)).toBe('101');
    expect(modules.slice(45, 50)).toBe('01010');
    expect(modules.slice(92)).toBe('101');
  });

  it('draws Code 39 between its star characters', async () => {
    // A trailing space module after the stop is only more quiet zone.
    const modules = bars(await encodeBarcode({ format: 'code_39', value: 'GYM42' })).replace(
      /0+$/,
      '',
    );
    expect(modules.startsWith(STAR)).toBe(true);
    expect(modules.endsWith(STAR)).toBe(true);
  });

  it('draws the other linear formats key tags and cards use', async () => {
    for (const code of [
      { format: 'codabar', value: 'A40156B' },
      { format: 'itf', value: '12345678' },
      { format: 'upc_a', value: '036000291452' },
      { format: 'ean_8', value: '96385074' },
    ] as const) {
      const modules = bars(await encodeBarcode(code));
      expect(modules, code.format).toMatch(/^1[01]*10*$/);
    }
  });

  it('draws a QR code as a square with its finder pattern in the corner', async () => {
    const graphic = await encodeBarcode({ format: 'qr_code', value: 'MEMBER-0042' });
    if (graphic?.kind !== 'matrix') throw new Error('expected a matrix');
    expect(graphic.size).toBe(21);
    expect(graphic.dark).toHaveLength(21 * 21);
    const row = (index: number) => graphic.dark.slice(index * 21, index * 21 + 8);
    expect(row(0)).toEqual([true, true, true, true, true, true, true, false]);
    expect(row(1)).toEqual([true, false, false, false, false, false, true, false]);
    expect(row(2)).toEqual([true, false, true, true, true, false, true, false]);
  });

  it('refuses a value its format cannot carry instead of drawing a wrong code', async () => {
    // A wrong EAN-13 check digit, and a character Code 128 has no symbol for.
    expect(await encodeBarcode({ format: 'ean_13', value: '5901234123458' })).toBeNull();
    expect(await encodeBarcode({ format: 'code_128', value: 'café' })).toBeNull();
    expect(await encodeBarcode({ format: 'itf', value: '12345' })).toBeNull();
  });
});
