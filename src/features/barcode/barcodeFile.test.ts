import { afterEach, describe, expect, it, vi } from 'vitest';
import { BARCODE_IMAGE_MAX_BYTES } from '../../core/validation/placeBarcode';
import { barcodeFromFile, readCode } from './barcodeFile';

// Eight bytes of PNG signature: enough for a data URL; nothing here decodes it.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function picture(type = 'image/png', bytes: BlobPart = PNG): File {
  return new File([bytes], 'barcode.png', { type });
}

interface Found {
  format: string;
  rawValue: string;
  boundingBox?: { width: number; height: number };
}

function detectorFinding(found: Found[], supported?: string[]) {
  const made: { formats?: string[] }[] = [];
  class FakeDetector {
    static getSupportedFormats = supported ? async () => supported : undefined;
    constructor(options?: { formats?: string[] }) {
      made.push(options ?? {});
    }
    async detect() {
      return found;
    }
  }
  return { host: { BarcodeDetector: FakeDetector }, made };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading a barcode from a picture', () => {
  it('reads nothing where the browser has no barcode reader', async () => {
    expect(await readCode(picture(), {})).toBeUndefined();
  });

  it('asks only for formats the app can draw, and keeps the largest drawable code', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', async () => ({ close }));
    const { host, made } = detectorFinding(
      [
        // A bigger code the app cannot draw is passed over, and so is an empty read.
        { format: 'aztec', rawValue: 'TICKET', boundingBox: { width: 400, height: 400 } },
        { format: 'code_128', rawValue: '  ', boundingBox: { width: 300, height: 300 } },
        { format: 'code_128', rawValue: 'SMALL', boundingBox: { width: 50, height: 20 } },
        { format: 'code_39', rawValue: 'GYM42', boundingBox: { width: 200, height: 60 } },
      ],
      ['aztec', 'qr_code', 'code_39', 'code_128', 'pdf417'],
    );
    expect(await readCode(picture(), host)).toEqual({ format: 'code_39', value: 'GYM42' });
    expect(made).toEqual([{ formats: ['code_128', 'code_39', 'qr_code'] }]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reads nothing when the phone supports none of the drawable formats', async () => {
    vi.stubGlobal('createImageBitmap', async () => ({}));
    const { host, made } = detectorFinding(
      [{ format: 'aztec', rawValue: 'X', boundingBox: { width: 1, height: 1 } }],
      ['aztec'],
    );
    expect(await readCode(picture(), host)).toBeUndefined();
    expect(made).toEqual([]);
  });

  it('treats a reader that throws as a picture with no code', async () => {
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('decode failed');
    });
    const { host } = detectorFinding([]);
    expect(await readCode(picture(), host)).toBeUndefined();
  });
});

describe('a picked picture becomes a barcode', () => {
  it('keeps the picture, and the code when the phone read one the app can draw', async () => {
    const picked = await barcodeFromFile(picture(), {
      readCode: async () => ({ format: 'code_128', value: 'ABC' }),
    });
    expect(picked.image.mimeType).toBe('image/png');
    expect(picked.image.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(picked.code).toEqual({ format: 'code_128', value: 'ABC' });
  });

  it('drops a read code the app would draw wrong, and keeps the picture', async () => {
    const picked = await barcodeFromFile(picture(), {
      readCode: async () => ({ format: 'ean_13', value: '5901234123458' }),
    });
    expect(picked.code).toBeUndefined();
    expect(picked.image.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('keeps just the picture when nothing was read', async () => {
    const picked = await barcodeFromFile(picture('image/jpeg'), {
      readCode: async () => undefined,
    });
    expect(picked).toEqual({
      image: {
        mimeType: 'image/jpeg',
        dataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      },
    });
  });

  it('keeps the picture when reading hangs or fails, rather than holding it up', async () => {
    const hung = await barcodeFromFile(picture(), {
      readCode: () => new Promise(() => {}),
      limitMs: 20,
    });
    expect(hung.code).toBeUndefined();
    expect(hung.image.dataUrl).toMatch(/^data:image\/png;base64,/);
    const failed = await barcodeFromFile(picture(), {
      readCode: () => Promise.reject(new Error('reader crashed')),
    });
    expect(failed.code).toBeUndefined();
  });

  it('refuses what cannot show at the desk, with a message that says what to do', async () => {
    const none = { readCode: async () => undefined };
    await expect(barcodeFromFile(picture('text/plain'), none)).rejects.toThrow(
      'Choose a screenshot or a photo of the barcode.',
    );
    await expect(barcodeFromFile(picture('image/heic'), none)).rejects.toThrow(
      'That picture format does not show in the browser. Use a screenshot or a JPEG.',
    );
    await expect(barcodeFromFile(picture('image/png', new Uint8Array()), none)).rejects.toThrow(
      'That file is empty.',
    );
    await expect(
      barcodeFromFile(picture('image/png', new Uint8Array(BARCODE_IMAGE_MAX_BYTES + 1)), none),
    ).rejects.toThrow('The picture must be 8 MB or smaller.');
  });
});
