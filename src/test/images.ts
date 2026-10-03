/** Made-up pictures for tests: a GIF of one frame, and the same made into an animation. */

export const ONE_FRAME_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Two frames with no control extension at all, which GIF89a allows (Pillow writes none without a
 * duration): an animation all the same.
 */
export function twoFrameGifWithoutControl(): string {
  const bytes = atob(ONE_FRAME_GIF.split(',')[1]!);
  const control = bytes.indexOf('\x21\xf9\x04');
  const image = bytes.slice(control + 8, bytes.lastIndexOf('\x3b'));
  return `data:image/gif;base64,${btoa(bytes.slice(0, control) + image + image + '\x3b')}`;
}

/** The one-frame GIF with its frame (control extension and image) twice: an animation. */
export function twoFrameGif(): string {
  const bytes = atob(ONE_FRAME_GIF.split(',')[1]!);
  const frameAt = bytes.indexOf('\x21\xf9\x04');
  const trailer = bytes.lastIndexOf('\x3b');
  const frame = bytes.slice(frameAt, trailer);
  return `data:image/gif;base64,${btoa(bytes.slice(0, frameAt) + frame + frame + '\x3b')}`;
}
