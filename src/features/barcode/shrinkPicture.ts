import { MIRROR_PICTURE_MAX, type MirrorPicture } from '../../core/state/barcodeMirror';

/**
 * A smaller copy of a barcode picture for its second copy on the phone (Maintenance 25): drawn on
 * white no bigger than 1,400 pixels a side and kept as a JPEG, smaller again until it fits local
 * storage's share. Plenty for a scanner reading a phone screen. Null where the browser cannot
 * draw a picture, or when no copy fits.
 */
export async function shrinkPicture(picture: MirrorPicture): Promise<MirrorPicture | null> {
  if (picture.dataUrl.length <= MIRROR_PICTURE_MAX) return picture;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const image = new Image();
    image.src = picture.dataUrl;
    await image.decode();
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (longest === 0) return null;
    for (const side of [1400, 1000, 700, 500]) {
      const scale = Math.min(1, side / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      if (dataUrl.startsWith('data:image/jpeg') && dataUrl.length <= MIRROR_PICTURE_MAX) {
        return { mimeType: 'image/jpeg', dataUrl };
      }
    }
    return null;
  } catch {
    return null;
  }
}
