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

/** A CRC-32 over a binary string, as a PNG chunk carries it. */
function crc32(bytes: string): number {
  let crc = 0xffffffff;
  for (let at = 0; at < bytes.length; at += 1) {
    crc ^= bytes.charCodeAt(at);
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bigEndian32(value: number): string {
  return String.fromCharCode(
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  );
}

/** The block that tells a GIF to loop: application extension NETSCAPE2.0, a count of 0 (for good). */
const GIF_LOOP_FOREVER = '\x21\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00';

/** A GIF told to loop for good: every loop count it gives set to 0, or the block put in. */
function loopingGif(bytes: string): string {
  let out = bytes;
  let found = false;
  for (const id of ['NETSCAPE2.0', 'ANIMEXTS1.0']) {
    const marker = `\x21\xff\x0b${id}\x03\x01`;
    for (let at = out.indexOf(marker); at >= 0; at = out.indexOf(marker, at + 1)) {
      found = true;
      const count = at + marker.length;
      out = out.slice(0, count) + '\x00\x00' + out.slice(count + 2);
    }
  }
  if (found) return out;
  // None: the block goes after the colour table, before any image; extensions need GIF89a.
  let start = 13;
  if (bytes.charCodeAt(10) & 0x80) start += 3 * 2 ** ((bytes.charCodeAt(10) & 7) + 1);
  return 'GIF89a' + bytes.slice(6, start) + GIF_LOOP_FOREVER + bytes.slice(start);
}

/** An animated WebP told to loop for good: its ANIM chunk's loop count set to 0. */
function loopingWebp(bytes: string): string {
  let at = 12;
  while (at + 8 <= bytes.length) {
    const size =
      (bytes.charCodeAt(at + 4) |
        (bytes.charCodeAt(at + 5) << 8) |
        (bytes.charCodeAt(at + 6) << 16) |
        (bytes.charCodeAt(at + 7) << 24)) >>>
      0;
    if (bytes.slice(at, at + 4) === 'ANIM') {
      // Its background colour (four bytes), then the loop count (two).
      const count = at + 8 + 4;
      return bytes.slice(0, count) + '\x00\x00' + bytes.slice(count + 2);
    }
    at += 8 + size + (size & 1);
  }
  return bytes;
}

/** An animated PNG told to loop for good: its acTL chunk's play count set to 0, its CRC anew. */
function loopingPng(bytes: string): string {
  let at = 8;
  while (at + 12 <= bytes.length) {
    const size =
      ((bytes.charCodeAt(at) << 24) |
        (bytes.charCodeAt(at + 1) << 16) |
        (bytes.charCodeAt(at + 2) << 8) |
        bytes.charCodeAt(at + 3)) >>>
      0;
    const type = bytes.slice(at + 4, at + 8);
    if (type === 'acTL' && size === 8) {
      // The frame count stays; the play count (the next four bytes) becomes 0.
      const data = bytes.slice(at + 8, at + 12) + '\x00\x00\x00\x00';
      return (
        bytes.slice(0, at + 8) +
        data +
        bigEndian32(crc32(type + data)) +
        bytes.slice(at + 8 + size + 4)
      );
    }
    if (type === 'IDAT' || type === 'IEND') break;
    at += 12 + size;
  }
  return bytes;
}

/**
 * The lifter's own moving picture, made to loop for good (the phone review): a GIF, WebP or PNG
 * whose file plays once, or a set number of times, stopped on its last frame on the card. Any
 * other picture, or one whose bytes cannot be read, is returned as it is.
 */
export function loopingImage(dataUrl: string): string {
  const bytes = bytesOf(dataUrl);
  if (bytes === null) return dataUrl;
  let looped: string;
  switch (formatOf(bytes)) {
    case 'gif':
      looped = loopingGif(bytes);
      break;
    case 'webp':
      looped = loopingWebp(bytes);
      break;
    case 'png':
      looped = loopingPng(bytes);
      break;
    default:
      return dataUrl;
  }
  if (looped === bytes) return dataUrl;
  return `${dataUrl.slice(0, dataUrl.indexOf(','))},${btoa(looped)}`;
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
