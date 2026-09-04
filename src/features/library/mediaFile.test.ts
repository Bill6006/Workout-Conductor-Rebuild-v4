import { describe, expect, it } from 'vitest';
import { CUSTOM_MEDIA_MAX_BYTES } from '../../core/validation/customExercise';
import { customMediaFromFile } from './mediaFile';

const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) =>
  c.charCodeAt(0),
);

describe('customMediaFromFile', () => {
  it('reads a GIF into an inline image record', async () => {
    const media = await customMediaFromFile(new File([GIF], 'bench.gif', { type: 'image/gif' }));
    expect(media.kind).toBe('image');
    expect(media.mimeType).toBe('image/gif');
    expect(media.sizeBytes).toBe(GIF.byteLength);
    expect(media.dataUrl.startsWith('data:image/gif;base64,')).toBe(true);
  });

  it('infers a GIF from the file name when the browser gives no type', async () => {
    const media = await customMediaFromFile(new File([GIF], 'bench.GIF'));
    expect(media.mimeType).toBe('image/gif');
  });

  it('marks videos as video', async () => {
    const media = await customMediaFromFile(new File([GIF], 'row.mp4', { type: 'video/mp4' }));
    expect(media.kind).toBe('video');
  });

  it('refuses files that are too big, empty, or not media', async () => {
    const big = new File([new Uint8Array(CUSTOM_MEDIA_MAX_BYTES + 1)], 'big.gif', {
      type: 'image/gif',
    });
    await expect(customMediaFromFile(big)).rejects.toThrow('3 MB or smaller');
    await expect(
      customMediaFromFile(new File([], 'empty.gif', { type: 'image/gif' })),
    ).rejects.toThrow('empty');
    await expect(
      customMediaFromFile(new File([GIF], 'notes.txt', { type: 'text/plain' })),
    ).rejects.toThrow('Choose a GIF');
  });
});
