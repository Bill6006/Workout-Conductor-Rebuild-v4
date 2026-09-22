import type { BarcodeCode, BarcodeFormat } from '../../core/validation/placeBarcode';

/**
 * Draws a read code cleanly: a row of bars for the linear formats, a square of
 * modules for QR. The libraries load only when a code is drawn, so they stay out
 * of the main bundle; the offline cache still holds them. Nothing here touches
 * the DOM, so the drawing can never carry markup from the value it encodes.
 */

export type BarcodeGraphic =
  { kind: 'bars'; modules: string } | { kind: 'matrix'; size: number; dark: boolean[] };

const LINEAR: Record<Exclude<BarcodeFormat, 'qr_code'>, string> = {
  code_128: 'CODE128',
  code_39: 'CODE39',
  code_93: 'CODE93',
  codabar: 'codabar',
  itf: 'ITF',
  ean_13: 'EAN13',
  ean_8: 'EAN8',
  upc_a: 'UPC',
  upc_e: 'UPCE',
};

interface Encodings {
  encodings?: { data?: string }[];
}

async function bars(format: keyof typeof LINEAR, value: string): Promise<BarcodeGraphic | null> {
  const module = await import('jsbarcode');
  const JsBarcode = (module.default ?? module) as unknown as (
    target: object,
    data: string,
    options: Record<string, unknown>,
  ) => void;
  const target: Encodings = {};
  let valid = true;
  try {
    JsBarcode(target, value, {
      format: LINEAR[format],
      flat: true,
      valid: (ok: boolean) => {
        valid = ok;
      },
    });
  } catch {
    return null;
  }
  const modules = (target.encodings ?? []).map((encoding) => encoding.data ?? '').join('');
  if (!valid || !/^[01]+$/.test(modules)) return null;
  return { kind: 'bars', modules };
}

async function matrix(value: string): Promise<BarcodeGraphic | null> {
  const module = await import('qrcode-generator');
  const qrcode = (module.default ?? module) as unknown as (
    typeNumber: number,
    level: 'L' | 'M' | 'Q' | 'H',
  ) => {
    addData: (data: string) => void;
    make: () => void;
    getModuleCount: () => number;
    isDark: (row: number, col: number) => boolean;
  };
  try {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const size = qr.getModuleCount();
    const dark: boolean[] = [];
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) dark.push(qr.isDark(row, col));
    }
    return { kind: 'matrix', size, dark };
  } catch {
    return null;
  }
}

/** The drawing for a code, or null when the value does not fit its format. */
export async function encodeBarcode(code: BarcodeCode): Promise<BarcodeGraphic | null> {
  if (code.format === 'qr_code') return matrix(code.value);
  return bars(code.format, code.value);
}
