import type { CatalogExercise } from '../exercises/exerciseSchema';
import { MOVEMENT_PATTERN_IDS, type MovementPatternId } from '../movementPatterns/movementPatterns';
import { EXERCISE_MEDIA } from './exerciseMedia';

/**
 * Production-media manifest. Every asset carries its source and license; see
 * docs/media-license-register.md. An exercise with a licensed demonstration of its own exact
 * variation shows it (Maintenance 25, item 7): a short silent clip, or a loop of licensed
 * drawings of its start and end. The rest keep the original diagram of their movement pattern,
 * which also stands in whenever a demonstration's still cannot load.
 */

export type MediaKind = 'placeholder-diagram' | 'production-loop';

/** Who made a licensed demonstration, on what terms, and what this app changed in it. */
export interface MediaCredit {
  /** The original's title, as its source names it. */
  title: string;
  /** Who to name, as the licence asks. */
  author: string;
  /** The short form shown under the demonstration. */
  byline: string;
  /** 'Public domain', 'CC BY 3.0' or 'CC BY-SA 4.0'. */
  license: string;
  licenseUrl: string | null;
  /** The page the original came from. */
  sourceUrl: string;
  /** The original file, where the page holds several. */
  fileUrl?: string;
  /** What was changed from the original. */
  changes: string;
  /** A notice the source asks every user to show (the U.S. government's non-endorsement line). */
  notice?: string;
}

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  /** A filmed clip or a loop of drawings; a placeholder is a diagram. */
  form?: 'video' | 'drawings';
  /** Static poster, path relative to the app base. */
  poster: string;
  /** Looping demonstration, path relative to the app base. */
  demo: string;
  demoType: 'image/svg+xml' | 'video/webm' | 'video/mp4' | 'image/gif';
  /** The demonstration's own size, so its box holds its shape before it loads. */
  width?: number;
  height?: number;
  source: string;
  license: string;
  credit?: MediaCredit;
  /** Where the demonstration differs in a detail from the exercise as written. */
  note?: string;
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

/**
 * Exercises whose movement pattern's diagram would show the wrong body position, with one of
 * their own (the ninth review): Dead Bug lies on its back, where the anti-extension diagram planks.
 */
export const EXERCISE_DIAGRAMS: ReadonlySet<string> = new Set(['dead-bug']);

function exerciseDiagram(id: string): MediaAsset {
  return {
    ...placeholderAssetFor('core-anti-extension'),
    id: `placeholder-${id}`,
    poster: `media/placeholders/${id}.svg`,
    demo: `media/placeholders/${id}-loop.svg`,
  };
}

/** The diagram an exercise falls back to: its own where it has one, else its movement pattern's. */
export function diagramFor(exercise: CatalogExercise): MediaAsset {
  return EXERCISE_DIAGRAMS.has(exercise.id)
    ? exerciseDiagram(exercise.id)
    : placeholderAssetFor(exercise.movementPattern);
}

/** Assets keyed by asset id: every placeholder and every licensed demonstration. */
export const MEDIA_ASSETS: Readonly<Record<string, MediaAsset>> = Object.fromEntries([
  ...MOVEMENT_PATTERN_IDS.map((pattern) => {
    const asset = placeholderAssetFor(pattern);
    return [asset.id, asset] as const;
  }),
  ...[...EXERCISE_DIAGRAMS].map((id) => {
    const asset = exerciseDiagram(id);
    return [asset.id, asset] as const;
  }),
  ...EXERCISE_MEDIA.map((asset) => [asset.id, asset] as const),
]);

/** Exercise media id -> asset id. A licensed demonstration overrides the pattern placeholder. */
export const MEDIA_MANIFEST: Readonly<Record<string, string>> = Object.fromEntries(
  EXERCISE_MEDIA.map((asset) => [asset.id.replace(/^demo-/, ''), asset.id]),
);

export function mediaFor(exercise: CatalogExercise): MediaAsset {
  const assetId = MEDIA_MANIFEST[exercise.mediaId];
  const asset = assetId ? MEDIA_ASSETS[assetId] : undefined;
  return asset ?? diagramFor(exercise);
}

export function hasProductionMedia(exercise: CatalogExercise): boolean {
  return mediaFor(exercise).kind === 'production-loop';
}

/** Whether a demonstration plays as a video (a clip or a drawing loop) rather than an image. */
export function isVideoAsset(asset: MediaAsset): boolean {
  return asset.demoType.startsWith('video/');
}

/** The short credit under a licensed demonstration: who made it, and on what terms. */
export function creditLine(asset: MediaAsset): string | null {
  if (!asset.credit) return null;
  const what = asset.form === 'drawings' ? 'Drawings' : 'Video';
  return `${what}: ${asset.credit.byline} · ${asset.credit.license}`;
}

/** Absolute URL for an asset path under the deployed base path. */
export function mediaUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${path}`;
}
