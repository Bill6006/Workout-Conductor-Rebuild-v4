import { useEffect, useState } from 'react';
import { makeFirstFrame } from './firstFrame';

/**
 * The lifter's own image, when it moves (Maintenance 25, item 7, the tenth review): an animated
 * GIF (or WebP, PNG or AVIF) rests on its first frame where motion must stop, as the catalog's
 * clips and diagrams do. A photo does not move and is shown as it is.
 */

/** The bytes of a base64 data URL, one character each; null when it is not one. */
function bytesOf(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !/;base64$/i.test(dataUrl.slice(0, comma))) return null;
  try {
    return atob(dataUrl.slice(comma + 1));
  } catch {
    return null;
  }
}

/** Types that hold one picture only, for when the bytes themselves cannot be read. */
const STILL_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/bmp',
  'image/x-ms-bmp',
]);

type Format = 'gif' | 'webp' | 'png' | 'isobmff' | 'jpeg' | 'bmp' | 'svg' | 'unknown';

/**
 * What a picture is, by its own first bytes, not the type it was given: a moving GIF saved with a
 * .jpg name is still a GIF (the tenth review's second re-check).
 */
function formatOf(bytes: string): Format {
  if (bytes.startsWith('GIF8')) return 'gif';
  if (bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP') return 'webp';
  if (bytes.startsWith('\x89PNG')) return 'png';
  if (bytes.slice(4, 8) === 'ftyp') return 'isobmff';
  if (bytes.startsWith('\xff\xd8\xff')) return 'jpeg';
  if (bytes.startsWith('BM')) return 'bmp';
  if (/^\s*(<\?xml|<svg|<!--)/i.test(bytes.slice(0, 256))) return 'svg';
  return 'unknown';
}

/**
 * A GIF's frames, counted by walking its blocks (two are enough to know it moves): a frame needs
 * no control extension of its own, so counting those missed some animations.
 */
function gifFrames(bytes: string): number {
  const code = (at: number) => bytes.charCodeAt(at);
  if (bytes.length < 13) return 0;
  let at = 13;
  if (code(10) & 0x80) at += 3 * 2 ** ((code(10) & 7) + 1);
  // Data sub-blocks: a length byte, that many bytes, until a length of zero.
  const skipSubBlocks = () => {
    while (at < bytes.length) {
      const size = code(at);
      at += 1;
      if (size === 0) return;
      at += size;
    }
  };
  let frames = 0;
  while (at < bytes.length && frames < 2) {
    const block = code(at);
    if (block === 0x21) {
      // An extension: its label, then its sub-blocks.
      at += 2;
      skipSubBlocks();
    } else if (block === 0x2c) {
      // An image: its descriptor, its own colours, the code size, then its data.
      frames += 1;
      const packed = code(at + 9);
      at += 10;
      if (packed & 0x80) at += 3 * 2 ** ((packed & 7) + 1);
      at += 1;
      skipSubBlocks();
    } else {
      // The trailer, or bytes this does not read: no more frames to find.
      break;
    }
  }
  return frames;
}

/** Whether an AVIF or HEIF file is an image sequence: it names itself among its brands. */
function isSequence(bytes: string): boolean {
  const size =
    ((bytes.charCodeAt(0) << 24) |
      (bytes.charCodeAt(1) << 16) |
      (bytes.charCodeAt(2) << 8) |
      bytes.charCodeAt(3)) >>>
    0;
  const brands = bytes.slice(8, Math.min(Math.max(size, 16), 256));
  return /avis|msf1|hevs/.test(brands);
}

/**
 * Whether an image moves: a GIF of more than one frame, an animated WebP, PNG or AVIF (or HEIF
 * sequence), judged by its own bytes. A photo (JPEG, BMP) never moves; an SVG or anything not
 * read here is taken to move, and so is a file whose bytes cannot be read unless its type is a
 * photo's, so that whatever moves can always be stopped.
 */
export function isAnimatedImage(dataUrl: string): boolean {
  const bytes = bytesOf(dataUrl);
  if (bytes === null) {
    const type = /^data:([^;,]+)/i.exec(dataUrl)?.[1]?.toLowerCase() ?? '';
    return !STILL_TYPES.has(type);
  }
  switch (formatOf(bytes)) {
    case 'jpeg':
    case 'bmp':
      return false;
    case 'gif':
      return gifFrames(bytes) > 1;
    case 'webp':
      // The extended header's animation bit, wherever the frames sit: a colour profile comes
      // before them (the tenth review's re-check).
      return bytes.slice(12, 16) === 'VP8X' && (bytes.charCodeAt(20) & 2) !== 0;
    case 'png': {
      // An animated PNG says so before its image data.
      const data = bytes.indexOf('IDAT');
      return bytes.slice(0, data < 0 ? undefined : data).includes('acTL');
    }
    case 'isobmff':
      return isSequence(bytes);
    default:
      return true;
  }
}

/**
 * The first frame of an image as a still, made the first time it is wanted and kept, so Pause
 * after Play shows it at once; freed once a still of another image takes its place, or when the
 * view closes (the tenth review's second re-check: a still freed on Play showed broken on the
 * next Pause). Null until it is made, and where it cannot be.
 */
export function useFirstFrame(dataUrl: string | null, wanted = true): string | null {
  const [frame, setFrame] = useState<{ from: string; still: string } | null>(null);
  const have = frame !== null && frame.from === dataUrl;
  const make = wanted && dataUrl !== null && !have;
  useEffect(() => {
    if (!make || !dataUrl) return undefined;
    let current = true;
    makeFirstFrame(dataUrl)
      .then((still) => {
        if (!still) return;
        if (current) setFrame({ from: dataUrl, still });
        else URL.revokeObjectURL(still);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [make, dataUrl]);
  // A still is freed once another takes its place, and when the view closes.
  useEffect(() => {
    if (!frame) return undefined;
    return () => URL.revokeObjectURL(frame.still);
  }, [frame]);
  return wanted && have ? frame.still : null;
}
