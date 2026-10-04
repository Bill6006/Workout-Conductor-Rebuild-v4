import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ONE_FRAME_GIF, twoFrameGif, twoFrameGifWithoutControl } from '../../test/images';
import { isAnimatedImage, loopingImage, useFirstFrame } from './animatedImage';
import { makeFirstFrame } from './firstFrame';

vi.mock('./firstFrame', () => ({ makeFirstFrame: vi.fn() }));

/**
 * Maintenance 25, item 7, the tenth review: the lifter's own image is stopped only when it moves.
 * Each picture here is a few made-up bytes in the shape of its format.
 */

const as = (type: string, bytes: string) => `data:${type};base64,${btoa(bytes)}`;

describe('isAnimatedImage', () => {
  it('tells a GIF of several frames from one of a single frame', () => {
    expect(isAnimatedImage(twoFrameGif())).toBe(true);
    expect(isAnimatedImage(ONE_FRAME_GIF)).toBe(false);
  });

  it('reads an animated PNG by the chunk that says so', () => {
    const png = '\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR........';
    expect(isAnimatedImage(as('image/png', `${png}\x00\x00\x00\x08acTL....IDAT....`))).toBe(true);
    expect(isAnimatedImage(as('image/png', `${png}IDAT....acTL`))).toBe(false);
  });

  it('reads an animated WebP by its header’s flag, a colour profile before its frames too (the re-check)', () => {
    /** The extended header with these flags, then a colour profile of 600 bytes, then the rest. */
    const webp = (flags: number, rest: string) =>
      as(
        'image/webp',
        `RIFF\x00\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00${String.fromCharCode(flags)}\x00\x00\x00` +
          `\x00\x00\x00\x00\x00\x00ICCP${'.'.repeat(600)}${rest}`,
      );
    // ICC profile and animation (0x22): the ANIM chunk sits far past the first 64 bytes.
    expect(isAnimatedImage(webp(0x22, 'ANIM......ANMF'))).toBe(true);
    // A colour profile alone (0x20): a still picture.
    expect(isAnimatedImage(webp(0x20, 'VP8 ......'))).toBe(false);
    expect(isAnimatedImage(as('image/webp', 'RIFF....WEBPVP8 ........'))).toBe(false);
  });

  it('reads an AVIF image sequence by its brand', () => {
    expect(
      isAnimatedImage(as('image/avif', '\x00\x00\x00\x18ftypavis\x00\x00\x00\x00avismiaf')),
    ).toBe(true);
    expect(
      isAnimatedImage(as('image/avif', '\x00\x00\x00\x1cftypavif\x00\x00\x00\x00avifmif1')),
    ).toBe(false);
  });

  it('takes a photo as still, and any format it does not read, or cannot read, as moving', () => {
    expect(isAnimatedImage(as('image/jpeg', '\xff\xd8\xff\xe0....'))).toBe(false);
    expect(isAnimatedImage(as('image/bmp', 'BM......'))).toBe(false);
    expect(isAnimatedImage('data:image/gif,not-base64')).toBe(true);
    // Bytes that cannot be read: the label decides, and a photo's or a bitmap's is still.
    for (const type of ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/bmp', 'image/x-ms-bmp']) {
      expect(isAnimatedImage(`data:${type},not-base64`)).toBe(false);
    }
    expect(isAnimatedImage(as('image/svg+xml', '<svg><animate attributeName="x"/></svg>'))).toBe(
      true,
    );
    // A HEIF still, and a HEIF sequence.
    expect(
      isAnimatedImage(as('image/heic', '\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic')),
    ).toBe(false);
    expect(
      isAnimatedImage(as('image/heic', '\x00\x00\x00\x18ftypmsf1\x00\x00\x00\x00msf1heic')),
    ).toBe(true);
  });

  it('counts a GIF’s frames, not its control extensions, and believes the bytes over the label (second re-check)', () => {
    expect(isAnimatedImage(twoFrameGifWithoutControl())).toBe(true);
    // A moving GIF saved with a .jpg name, a moving WebP labelled a PNG.
    const gifBytes = twoFrameGif().split(',')[1]!;
    expect(isAnimatedImage(`data:image/jpeg;base64,${gifBytes}`)).toBe(true);
    const webp =
      'RIFF\x00\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00ANIM';
    expect(isAnimatedImage(as('image/png', webp))).toBe(true);
    // A photo labelled a GIF stays a photo.
    expect(isAnimatedImage(as('image/gif', '\xff\xd8\xff\xe0....'))).toBe(false);
  });
});

describe('loopingImage (the phone review)', () => {
  const bytes = (dataUrl: string) => atob(dataUrl.split(',')[1]!);

  it('tells a GIF with no loop block to loop for good, its frames untouched', () => {
    const original = bytes(twoFrameGif());
    const looped = bytes(loopingImage(twoFrameGif()));
    const loopBlock = '\x21\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00';
    // After the header, the screen and its two-colour table (13 + 6 bytes), before any image.
    expect(looped).toBe('GIF89a' + original.slice(6, 19) + loopBlock + original.slice(19));
    expect(isAnimatedImage(loopingImage(twoFrameGif()))).toBe(true);
  });

  it('sets a loop count the GIF gives to 0, wherever its block is', () => {
    const original = bytes(twoFrameGif());
    for (const id of ['NETSCAPE2.0', 'ANIMEXTS1.0']) {
      const once = `\x21\xff\x0b${id}\x03\x01\x01\x00\x00`;
      const gif = original.slice(0, 19) + once + original.slice(19);
      const looped = bytes(loopingImage(as('image/gif', gif)));
      expect(looped).toBe(
        original.slice(0, 19) + `\x21\xff\x0b${id}\x03\x01\x00\x00\x00` + original.slice(19),
      );
    }
  });

  it("sets an animated WebP's loop count to 0", () => {
    const head =
      'RIFF\x00\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00';
    const anim = (loops: string) => `ANIM\x06\x00\x00\x00\xff\xff\xff\xff${loops}`;
    const webp = as('image/webp', `${head}${anim('\x03\x00')}ANMF\x00\x00\x00\x00`);
    expect(bytes(loopingImage(webp))).toBe(`${head}${anim('\x00\x00')}ANMF\x00\x00\x00\x00`);
  });

  it("sets an animated PNG's play count to 0, with the chunk's check value made anew", () => {
    const head = '\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR' + '\x00'.repeat(13) + '\x00\x00\x00\x00';
    const acTL = (plays: string, crc: string) =>
      `\x00\x00\x00\x08acTL\x00\x00\x00\x02${plays}${crc}`;
    const png = as('image/png', `${head}${acTL('\x00\x00\x00\x03', '\x6a\x84\xc2\xca')}IDAT`);
    // CRC-32 of "acTL" and its data with a play count of 0: f38d9370 (zlib).
    expect(bytes(loopingImage(png))).toBe(
      `${head}${acTL('\x00\x00\x00\x00', '\xf3\x8d\x93\x70')}IDAT`,
    );
  });

  it('returns any other picture, and one whose bytes cannot be read, as it is', () => {
    for (const picture of [
      as('image/jpeg', '\xff\xd8\xff\xe0....'),
      as('image/avif', '\x00\x00\x00\x18ftypavis\x00\x00\x00\x00avismiaf'),
      'data:image/gif,not-base64',
    ]) {
      expect(loopingImage(picture)).toBe(picture);
    }
    // A GIF that loops for good already, and a still WebP or PNG, are returned unchanged.
    const forever = loopingImage(twoFrameGif());
    expect(loopingImage(forever)).toBe(forever);
    const still = as('image/webp', 'RIFF\x00\x00\x00\x00WEBPVP8 \x04\x00\x00\x00....');
    expect(loopingImage(still)).toBe(still);
  });
});

describe('useFirstFrame', () => {
  afterEach(() => {
    vi.mocked(makeFirstFrame).mockReset();
  });

  it('keeps the still while the picture stays the same, and frees it when the view closes (second re-check)', async () => {
    URL.revokeObjectURL = vi.fn();
    vi.mocked(makeFirstFrame).mockResolvedValue('blob:still-1');
    const gif = twoFrameGif();
    const { result, rerender, unmount } = renderHook(({ wanted }) => useFirstFrame(gif, wanted), {
      initialProps: { wanted: true },
    });
    await waitFor(() => expect(result.current).toBe('blob:still-1'));
    // Played: no still wanted, none freed.
    rerender({ wanted: false });
    expect(result.current).toBeNull();
    // Paused again: the same still at once, never one already freed, and none made anew.
    rerender({ wanted: true });
    expect(result.current).toBe('blob:still-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(makeFirstFrame).toHaveBeenCalledTimes(1);
    act(() => unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:still-1');
  });
});
