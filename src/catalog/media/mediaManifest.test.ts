import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../exercises/catalog';
import { MOVEMENT_PATTERN_IDS } from '../movementPatterns/movementPatterns';
import { MEDIA_ASSETS, hasProductionMedia, mediaFor, mediaUrl } from './mediaManifest';

const PUBLIC = path.join(process.cwd(), 'public');

describe('media manifest', () => {
  it('registers a licensed asset with existing files for every movement pattern', () => {
    for (const pattern of MOVEMENT_PATTERN_IDS) {
      const asset = MEDIA_ASSETS[`placeholder-${pattern}`];
      expect(asset, pattern).toBeDefined();
      if (!asset) continue;
      expect(asset.source.length).toBeGreaterThan(10);
      expect(asset.license.length).toBeGreaterThan(3);
      for (const file of [asset.poster, asset.demo]) {
        const full = path.join(PUBLIC, file);
        expect(existsSync(full), `${file} must exist`).toBe(true);
        // A diagram, labelled as one (the ninth review), never as a placeholder.
        expect(readFileSync(full, 'utf8')).toContain('aria-label="Diagram: ');
        expect(readFileSync(full, 'utf8')).not.toMatch(/PLACEHOLDER/i);
      }
      expect(readFileSync(path.join(PUBLIC, asset.demo), 'utf8')).toContain('<animateTransform');
    }
  });

  it('gives Dead Bug a diagram of its own, on its back, where its pattern’s would plank', () => {
    const deadBug = EXERCISES.find((exercise) => exercise.id === 'dead-bug')!;
    const asset = mediaFor(deadBug);
    expect(asset.poster).toBe('media/placeholders/dead-bug.svg');
    expect(asset.demo).toBe('media/placeholders/dead-bug-loop.svg');
    const svg = readFileSync(path.join(PUBLIC, asset.demo), 'utf8');
    expect(svg).toContain('aria-label="Diagram: Dead bug"');
    expect(svg).toContain('<animateTransform');
    // The pattern's own diagram is the plank, which a Dead Bug is not.
    const plank = MEDIA_ASSETS['placeholder-core-anti-extension']!;
    expect(readFileSync(path.join(PUBLIC, plank.poster), 'utf8')).not.toBe(
      readFileSync(path.join(PUBLIC, asset.poster), 'utf8'),
    );
  });

  it('resolves every catalog exercise to a working demonstration', () => {
    for (const exercise of EXERCISES) {
      const asset = mediaFor(exercise);
      expect(existsSync(path.join(PUBLIC, asset.poster)), exercise.id).toBe(true);
      expect(existsSync(path.join(PUBLIC, asset.demo)), exercise.id).toBe(true);
    }
  });

  it('never marks an exercise production-enabled without production media', () => {
    for (const exercise of EXERCISES) {
      if (exercise.productionEnabled) {
        expect(hasProductionMedia(exercise), exercise.id).toBe(true);
      }
    }
  });

  it('builds URLs under the app base path', () => {
    expect(mediaUrl('media/placeholders/squat.svg')).toMatch(/\/media\/placeholders\/squat\.svg$/);
  });
});
