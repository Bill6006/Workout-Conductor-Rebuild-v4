import type { CatalogExercise } from '../exercises/exerciseSchema';
import { MOVEMENT_PATTERN_IDS, type MovementPatternId } from '../movementPatterns/movementPatterns';

/**
 * Production-media manifest. Every asset carries its source and license; see
 * docs/media-license-register.md. During development each exercise maps to an
 * original diagram-style placeholder loop for its movement pattern. Phase 8
 * replaces placeholders with licensed production loops for every
 * production-enabled exercise.
 */

export type MediaKind = 'placeholder-diagram' | 'production-loop';

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  /** Static poster, path relative to the app base. */
  poster: string;
  /** Looping demonstration, path relative to the app base. */
  demo: string;
  demoType: 'image/svg+xml' | 'video/webm' | 'video/mp4' | 'image/gif';
  source: string;
  license: string;
}

export const PLACEHOLDER_SOURCE =
  'Original diagram generated for this project by scripts/generate-placeholder-media.mjs';
export const PLACEHOLDER_LICENSE = 'MIT (project license); original work, no third-party material';

export function placeholderAssetFor(pattern: MovementPatternId): MediaAsset {
  return {
    id: `placeholder-${pattern}`,
    kind: 'placeholder-diagram',
    poster: `media/placeholders/${pattern}.svg`,
    demo: `media/placeholders/${pattern}-loop.svg`,
    demoType: 'image/svg+xml',
    source: PLACEHOLDER_SOURCE,
    license: PLACEHOLDER_LICENSE,
  };
}

/** Assets keyed by asset id: every placeholder plus, later, every production loop. */
export const MEDIA_ASSETS: Readonly<Record<string, MediaAsset>> = Object.fromEntries(
  MOVEMENT_PATTERN_IDS.map((pattern) => {
    const asset = placeholderAssetFor(pattern);
    return [asset.id, asset];
  }),
);

/** Exercise media id -> asset id. Production entries override the pattern placeholder. */
export const MEDIA_MANIFEST: Readonly<Record<string, string>> = {};

export function mediaFor(exercise: CatalogExercise): MediaAsset {
  const assetId = MEDIA_MANIFEST[exercise.mediaId];
  const asset = assetId ? MEDIA_ASSETS[assetId] : undefined;
  return asset ?? placeholderAssetFor(exercise.movementPattern);
}

export function hasProductionMedia(exercise: CatalogExercise): boolean {
  return mediaFor(exercise).kind === 'production-loop';
}

/** Absolute URL for an asset path under the deployed base path. */
export function mediaUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${path}`;
}
