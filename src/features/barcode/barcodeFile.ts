import {
  BARCODE_FORMATS,
  BARCODE_IMAGE_MAX_BYTES,
  type BarcodeCode,
  type BarcodeFormat,
  type PickedBarcode,
} from '../../core/validation/placeBarcode';
import { readAsDataUrl } from '../library/mediaFile';
import { encodeBarcode } from './encode';

/**
 * Turns a picked picture into a place's barcode. The picture is kept as it is.
 * Where the browser can read barcodes (Chrome on Android can), the code is read
 * from it too, so the app can draw it cleanly; anywhere else, or when nothing
 * readable is found, the picture alone is what shows at the desk.
 */

interface DetectedBarcode {
  format: string;
  rawValue: string;
  boundingBox?: { width: number; height: number };
}

interface BarcodeDetectorClass {
  new (options?: { formats?: string[] }): {
    detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
  };
  getSupportedFormats?: () => Promise<string[]>;
}

const DRAWABLE = new Set<string>(BARCODE_FORMATS);

function area(item: DetectedBarcode): number {
  return (item.boundingBox?.width ?? 0) * (item.boundingBox?.height ?? 0);
}

/** The largest drawable code in the picture, or undefined when none can be read here. */
export async function readCode(
  picture: Blob,
  host: { BarcodeDetector?: BarcodeDetectorClass } = globalThis as {
    BarcodeDetector?: BarcodeDetectorClass;
  },
): Promise<BarcodeCode | undefined> {
  const Detector = host.BarcodeDetector;
  if (typeof Detector !== 'function' || typeof createImageBitmap !== 'function') return undefined;
  try {
    const supported = (await Detector.getSupportedFormats?.()) ?? [...BARCODE_FORMATS];
    const formats = BARCODE_FORMATS.filter((format) => supported.includes(format));
    if (formats.length === 0) return undefined;
    const bitmap = await createImageBitmap(picture);
    try {
      const found = await new Detector({ formats: [...formats] }).detect(bitmap);
      const best = found
        .filter((item) => DRAWABLE.has(item.format) && item.rawValue.trim().length > 0)
        .sort((a, b) => area(b) - area(a))[0];
      return best ? { format: best.format as BarcodeFormat, value: best.rawValue } : undefined;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return undefined;
  }
}

/** Reading and checking the code gets this long; past it, the picture alone is kept. */
export const READ_LIMIT_MS = 6000;

function atMost<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** The read code, kept only when the app can draw it; a value that does not fit its format is not. */
async function drawableCode(
  picture: Blob,
  read: (picture: Blob) => Promise<BarcodeCode | undefined>,
): Promise<BarcodeCode | undefined> {
  const code = await read(picture);
  if (!code) return undefined;
  return (await encodeBarcode(code)) !== null ? code : undefined;
}

export async function barcodeFromFile(
  file: File,
  options: {
    readCode?: (picture: Blob) => Promise<BarcodeCode | undefined>;
    limitMs?: number;
  } = {},
): Promise<PickedBarcode> {
  const mimeType = file.type;
  if (!/^image\//.test(mimeType)) {
    throw new Error('Choose a screenshot or a photo of the barcode.');
  }
  if (/heic|heif/i.test(mimeType)) {
    throw new Error(
      'That picture format does not show in the browser. Use a screenshot or a JPEG.',
    );
  }
  if (file.size === 0) throw new Error('That file is empty.');
  if (file.size > BARCODE_IMAGE_MAX_BYTES) {
    throw new Error('The picture must be 8 MB or smaller.');
  }
  const dataUrl = await readAsDataUrl(file);
  // A slow or failed read (the drawing code not loaded yet, say) never holds up the picture.
  const code = await atMost(
    drawableCode(file, options.readCode ?? readCode),
    options.limitMs ?? READ_LIMIT_MS,
    undefined,
  );
  return code ? { image: { mimeType, dataUrl }, code } : { image: { mimeType, dataUrl } };
}
