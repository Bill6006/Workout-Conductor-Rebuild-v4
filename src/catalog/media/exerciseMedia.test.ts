import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXERCISES, requireExercise } from '../exercises/catalog';
import { DEMONSTRATED_EXERCISE_IDS, DOW_NOTICE, EXERCISE_MEDIA } from './exerciseMedia';
import { mediaFor } from './mediaManifest';

/**
 * Maintenance 25, item 7: each exercise's demonstration is its own, kept with the app, licensed,
 * credited and small. The exercises with none are the eleven the licence register explains.
 */

const PUBLIC = path.join(process.cwd(), 'public');
const REGISTER = readFileSync(
  path.join(process.cwd(), 'docs', 'media-license-register.md'),
  'utf8',
);

/** The exercises with no reusable demonstration of their exact variation (the register says why). */
const WITHOUT_DEMONSTRATION = [
  'band-lateral-raise',
  'band-pull-apart',
  'chest-supported-row',
  'incline-dumbbell-curl',
  'wrist-curl',
  'diamond-push-up',
  'dead-bug',
  'ab-wheel-rollout',
  'cable-crunch',
  'pallof-press',
  // The ninth review: its clip showed a leg press on the hack machine, not the hack squat.
  'hack-squat',
];

/** The register's table row for an exercise (prettier pads the cells). */
const registerRow = (id: string) => new RegExp(`^\\| ${id} +\\| .+ \\|$`, 'm');

/** The cells of the register's row for an exercise in the demonstrations' table. */
function registerCells(id: string): string[] {
  const row = REGISTER.match(registerRow(id))?.[0] ?? '';
  return row
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** A WebP still's own width and height, read from its header (lossy, lossless or extended). */
function webpSize(file: string): { width: number; height: number } {
  const data = readFileSync(file);
  expect(data.toString('ascii', 0, 4)).toBe('RIFF');
  expect(data.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  expect(chunk).toBe('VP8X');
  return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
}

describe('the exercises’ demonstrations', () => {
  it('gives every exercise its own demonstration but the eleven the register explains', () => {
    const without = EXERCISES.filter((exercise) => !DEMONSTRATED_EXERCISE_IDS.has(exercise.id));
    expect(without.map((exercise) => exercise.id).sort()).toEqual(
      [...WITHOUT_DEMONSTRATION].sort(),
    );
    for (const id of WITHOUT_DEMONSTRATION) {
      expect(mediaFor(requireExercise(id)).kind, id).toBe('placeholder-diagram');
      // The register names each one and why no reusable demonstration was found.
      expect(REGISTER, id).toMatch(registerRow(id));
    }
    expect(EXERCISE_MEDIA).toHaveLength(EXERCISES.length - WITHOUT_DEMONSTRATION.length);
  });

  it('maps each demonstration to the catalog exercise it shows, and back', () => {
    for (const asset of EXERCISE_MEDIA) {
      const id = asset.id.replace(/^demo-/, '');
      const exercise = requireExercise(id);
      expect(mediaFor(exercise)).toBe(asset);
      expect(asset.poster).toMatch(new RegExp(`^media/exercises/${id}\\.[0-9a-f]{8}\\.webp$`));
      expect(asset.demo).toMatch(new RegExp(`^media/exercises/${id}\\.[0-9a-f]{8}\\.mp4$`));
    }
  });

  it('names every file by its content, so a corrected one reaches a phone that kept the old', () => {
    for (const asset of EXERCISE_MEDIA) {
      for (const file of [asset.demo, asset.poster]) {
        const digest = createHash('sha256')
          .update(readFileSync(path.join(PUBLIC, file)))
          .digest('hex')
          .slice(0, 8);
        expect(file, asset.id).toContain(`.${digest}.`);
      }
    }
  });

  it('keeps every file with the app, small enough for a phone, its still the shape it says', () => {
    let total = 0;
    for (const asset of EXERCISE_MEDIA) {
      const clip = path.join(PUBLIC, asset.demo);
      const still = path.join(PUBLIC, asset.poster);
      expect(existsSync(clip), asset.demo).toBe(true);
      expect(existsSync(still), asset.poster).toBe(true);
      const clipBytes = statSync(clip).size;
      const stillBytes = statSync(still).size;
      expect(clipBytes, asset.demo).toBeLessThanOrEqual(180_000);
      expect(stillBytes, asset.poster).toBeLessThanOrEqual(30_000);
      total += clipBytes + stillBytes;
      // The MP4's first box says what it is; the still is the clip's own size.
      expect(readFileSync(clip).toString('ascii', 4, 8), asset.demo).toBe('ftyp');
      expect(webpSize(still), asset.poster).toEqual({ width: asset.width, height: asset.height });
      expect(asset.width ?? 0, asset.id).toBeLessThanOrEqual(480);
      expect(asset.height ?? 0, asset.id).toBeLessThanOrEqual(512);
    }
    // All of it together stays a small part of an install.
    expect(total).toBeLessThan(6_000_000);
  });

  it('credits each demonstration with its source, author, licence and what was changed', () => {
    const licences = new Set(['Public domain', 'CC BY 3.0', 'CC BY-SA 4.0']);
    for (const asset of EXERCISE_MEDIA) {
      const credit = asset.credit;
      expect(credit, asset.id).toBeDefined();
      if (!credit) continue;
      expect(licences.has(credit.license), asset.id).toBe(true);
      expect(asset.license).toBe(credit.license);
      expect(credit.title.length, asset.id).toBeGreaterThan(2);
      expect(credit.author.length, asset.id).toBeGreaterThan(2);
      expect(credit.sourceUrl, asset.id).toMatch(/^https:\/\//);
      expect(credit.changes, asset.id).toMatch(/without sound/);
      // A filmed clip's loop ends in its start (the ninth review); cropped or not, it says which.
      if (asset.form === 'video') {
        expect(credit.changes, asset.id).toContain('its end blended into its start');
        expect(credit.changes, asset.id).toMatch(/, (cropped and resized|resized);/);
      }
      if (credit.license === 'Public domain') {
        expect(credit.licenseUrl, asset.id).toBeNull();
      } else {
        expect(credit.licenseUrl, asset.id).toMatch(/^https:\/\/creativecommons\.org\/licenses\//);
      }
      // A share-alike original keeps its adaptation under the same licence.
      if (credit.license === 'CC BY-SA 4.0') {
        expect(credit.changes, asset.id).toContain('shared under the same licence');
      }
      // U.S. military footage carries the notice DVIDS asks every user to show, word for word.
      if (credit.sourceUrl.startsWith('https://www.dvidshub.net/')) {
        expect(credit.license, asset.id).toBe('Public domain');
        expect(credit.notice, asset.id).toBe(
          'The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.',
        );
        expect(DOW_NOTICE).toBe(credit.notice);
      } else {
        expect(credit.notice, asset.id).toBeUndefined();
      }
      // The register has the same row, with the same author and licence.
      const cells = registerCells(asset.id.replace(/^demo-/, ''));
      expect(cells[2], asset.id).toBe(credit.author);
      expect(cells[3], asset.id).toBe(credit.license);
    }
  });

  it('says a clip was cropped only where it was: eight keep the whole frame', () => {
    // The chest press is cropped of its film's black bars (the tenth review's re-check).
    const whole = [
      'barbell-bench-press',
      'incline-barbell-bench-press',
      'dumbbell-bench-press',
      'incline-dumbbell-press',
      'dip',
      'rear-delt-fly',
      'barbell-row',
      'standing-calf-raise',
    ];
    for (const asset of EXERCISE_MEDIA.filter((each) => each.form === 'video')) {
      const id = asset.id.replace(/^demo-/, '');
      const changes = asset.credit?.changes ?? '';
      if (whole.includes(id)) expect(changes, id).not.toContain('cropped');
      else expect(changes, id).toContain('cropped and resized');
    }
  });

  it('says under a demonstration where it differs from the steps, and the steps hold', () => {
    const notes: Record<string, RegExp> = {
      'dumbbell-row': /kettlebell/,
      'hanging-leg-raise': /straight legs/,
      'close-grip-bench-press': /shoulder width/,
      'machine-chest-press': /mid-chest/,
      'leg-press': /90 degrees/,
      'cable-lateral-raise': /level with it/,
      'pec-deck': /slight bend/,
      'cable-fly': /stand tall/,
      'bench-dip': /feet on the floor/,
      'dumbbell-pullover': /line up with your body/,
    };
    for (const [id, note] of Object.entries(notes)) {
      expect(mediaFor(requireExercise(id)).note, id).toMatch(note);
    }
    // Only these carry a note: every other demonstration shows what its steps say.
    expect(
      EXERCISE_MEDIA.filter((asset) => asset.note)
        .map((asset) => asset.id)
        .sort(),
    ).toEqual(
      Object.keys(notes)
        .map((id) => `demo-${id}`)
        .sort(),
    );
  });

  it('teaches the version each demonstration shows', () => {
    // Where the demonstration set the setup, the How to says it (docs/exercise-howto-sources.md).
    const shows: Record<string, RegExp> = {
      'cable-fly': /about level with the top of your head/,
      'band-chest-press': /Wrap the band across your upper back/,
      'rear-delt-fly': /Sit on the end of a bench/,
      'lat-pulldown': /if there is a thigh pad/,
      'bulgarian-split-squat': /dumbbells or kettlebells/,
      'inverted-row': /Smith machine/,
      'cable-overhead-triceps-extension': /head height or higher/,
      'incline-barbell-bench-press': /about 30 degrees/,
      'preacher-curl': /Machine:/,
      'hanging-leg-raise': /straight legs/,
    };
    for (const [id, pattern] of Object.entries(shows)) {
      const { setup, execution, cues, mistakes, range } = requireExercise(id).instructions;
      const text = [...setup, ...execution, ...cues, ...mistakes, range ?? ''].join(' ');
      expect(text, id).toMatch(pattern);
    }
    // A detail the text cannot change is said under the demonstration.
    expect(mediaFor(requireExercise('dumbbell-row')).note).toMatch(/kettlebell/);
    expect(mediaFor(requireExercise('hanging-leg-raise')).note).toMatch(/straight legs/);
  });

  it('takes no clip from a source the research turned down', () => {
    for (const asset of EXERCISE_MEDIA) {
      expect(asset.credit?.sourceUrl ?? '', asset.id).not.toMatch(
        /youtube\.com|youtu\.be|pexels|pixabay|musclewiki|exercisedb|giphy/i,
      );
    }
  });
});
