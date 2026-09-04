import type { NewCustomMedia } from '../../core/state/appStore';
import { CUSTOM_MEDIA_MAX_BYTES } from '../../core/validation/customExercise';

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Turns a picked file into a user demonstration record. GIFs, photos, and
 * short videos are accepted up to 3 MB; anything else is refused with a
 * message the toast can show as it is.
 */
export async function customMediaFromFile(file: File): Promise<NewCustomMedia> {
  const mimeType = file.type || (file.name.toLowerCase().endsWith('.gif') ? 'image/gif' : '');
  if (!/^(image|video)\//.test(mimeType)) {
    throw new Error('Choose a GIF, a photo, or a short video.');
  }
  if (file.size > CUSTOM_MEDIA_MAX_BYTES) {
    throw new Error('Media must be 3 MB or smaller.');
  }
  if (file.size === 0) {
    throw new Error('That file is empty.');
  }
  return {
    kind: mimeType.startsWith('video/') ? 'video' : 'image',
    mimeType,
    sizeBytes: file.size,
    dataUrl: await readAsDataUrl(file),
  };
}
