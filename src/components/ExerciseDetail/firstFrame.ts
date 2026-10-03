/** The longest side of a first frame's still, in pixels: enough for How to, light to keep. */
const STILL_MAX = 640;

/**
 * A still of an image's first frame, as an object URL; null where it cannot be made (no canvas).
 * A canvas draws an animated image's first frame (HTML: its default image).
 */
export async function makeFirstFrame(dataUrl: string): Promise<string | null> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, STILL_MAX / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}
