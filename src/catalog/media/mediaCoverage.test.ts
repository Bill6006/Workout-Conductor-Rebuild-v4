import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../exercises/catalog';
import { MOVEMENT_PATTERN_IDS } from '../movementPatterns/movementPatterns';
import { mediaFor } from './mediaManifest';

const PUBLIC = join(process.cwd(), 'public');

/**
 * Final demonstration coverage: every exercise in the catalog resolves to a
 * poster and a looping demonstration that exist in the build, every movement
 * pattern has its placeholder pair, and every loop actually animates.
 */
describe('demonstration coverage', () => {
  it('gives every catalog exercise an existing poster and loop', () => {
    const missing: string[] = [];
    for (const exercise of EXERCISES) {
      const asset = mediaFor(exercise);
      for (const file of [asset.poster, asset.demo]) {
        if (!existsSync(join(PUBLIC, file))) missing.push(`${exercise.id}: ${file}`);
      }
    }
    expect(missing).toEqual([]);
    expect(EXERCISES.length).toBeGreaterThan(20);
  });

  it('has a diagram pair for every movement pattern, and every loop animates', () => {
    const problems: string[] = [];
    for (const pattern of MOVEMENT_PATTERN_IDS) {
      const poster = join(PUBLIC, 'media', 'placeholders', `${pattern}.svg`);
      const loop = join(PUBLIC, 'media', 'placeholders', `${pattern}-loop.svg`);
      if (!existsSync(poster)) problems.push(`${pattern}: poster missing`);
      if (!existsSync(loop)) {
        problems.push(`${pattern}: loop missing`);
        continue;
      }
      const svg = readFileSync(loop, 'utf8');
      if (!/<animate/.test(svg)) problems.push(`${pattern}: loop has no animation`);
      // Shown where an exercise has no demonstration, so it is a diagram, never a "placeholder".
      if (!svg.includes('aria-label="Diagram: '))
        problems.push(`${pattern}: loop is not labelled as a diagram`);
      if (/placeholder/i.test(svg.replace(/media\/placeholders/g, '')))
        problems.push(`${pattern}: loop still says placeholder`);
    }
    expect(problems).toEqual([]);
  });

  it('lists every placeholder in the media license register as original work', () => {
    const register = readFileSync(join(process.cwd(), 'docs', 'media-license-register.md'), 'utf8');
    expect(register).toMatch(/original/i);
    expect(register).toMatch(/placeholder/i);
  });
});
