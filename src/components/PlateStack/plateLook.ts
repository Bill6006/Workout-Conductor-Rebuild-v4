import type { UnitSystem } from '../../core/validation/profile';

/**
 * How a plate is drawn, seen edge-on on the bar (Maintenance 25, item 8): its height is its
 * diameter, its width its thickness, both in proportion to real plates (iron plates in pounds,
 * calibrated plates in kilograms), widened only where its printed weight needs the room. Each size
 * has its own colour, after the colour order competition plates use, and every number is printed
 * at 4.5:1 or more against its plate.
 */
export interface PlateLook {
  /** Height (the plate's diameter) in the full drawing, in pixels. */
  height: number;
  /** Width (the plate's thickness, widened for its label) in the full drawing, in pixels. */
  width: number;
  /** Size of the weight printed on it, in pixels. */
  font: number;
  fill: string;
  ink: string;
}

const RED = { fill: '#c62f2c', ink: '#ffffff' };
const BLUE = { fill: '#2556d4', ink: '#ffffff' };
const YELLOW = { fill: '#efc22a', ink: '#1c1917' };
const GREEN = { fill: '#2ea55a', ink: '#04210f' };
const WHITE = { fill: '#e8ebef', ink: '#111827' };
const CHROME = { fill: '#a5acb5', ink: '#111827' };
const BLACK = { fill: '#3a4049', ink: '#ffffff' };

// Diameters scaled from 45 lb = 17.7 in (450 mm) to 88 px: 35 lb 15.3 in, 25 lb 12.7 in,
// 10 lb 10.3 in, 5 lb 8.3 in, 2.5 lb 7 in; thicknesses from 1.5 in down to 0.6 in.
const LOOKS: Record<UnitSystem, Record<string, PlateLook>> = {
  lb: {
    '45': { height: 88, width: 25, font: 12, ...BLUE },
    '35': { height: 76, width: 23, font: 12, ...YELLOW },
    '25': { height: 63, width: 22, font: 11.5, ...GREEN },
    '10': { height: 51, width: 19, font: 11, ...WHITE },
    '5': { height: 41, width: 18, font: 10.5, ...RED },
    '2.5': { height: 35, width: 20, font: 9.5, ...CHROME },
  },
  // Calibrated plates: 25 and 20 kg 450 mm, 15 kg 400, 10 kg 325, 5 kg 230, 2.5 kg 190, 1.25 kg 160.
  kg: {
    '25': { height: 88, width: 25, font: 12, ...RED },
    '20': { height: 86, width: 23, font: 12, ...BLUE },
    '15': { height: 78, width: 22, font: 12, ...YELLOW },
    '10': { height: 64, width: 20, font: 11, ...GREEN },
    '5': { height: 46, width: 19, font: 10.5, ...WHITE },
    '2.5': { height: 38, width: 19, font: 9, ...BLACK },
    '1.25': { height: 32, width: 23, font: 8.5, ...CHROME },
  },
};

/** A plate of a size this app does not stock: sized between its neighbours, drawn plain. */
function fallbackLook(size: number, units: UnitSystem): PlateLook {
  const sizes = Object.keys(LOOKS[units])
    .map(Number)
    .sort((a, b) => b - a);
  const heaviest = sizes[0] ?? 45;
  const height = Math.round(32 + (56 * Math.min(size, heaviest)) / heaviest);
  return { height, width: 22, font: 10, ...CHROME };
}

export function plateLook(size: number, units: UnitSystem): PlateLook {
  return LOOKS[units][String(size)] ?? fallbackLook(size, units);
}

/** Runs of one plate size, heaviest first: [45, 45, 25] is two 45s, then one 25. */
export function plateRuns(perSide: readonly number[]): { size: number; count: number }[] {
  const runs: { size: number; count: number }[] = [];
  for (const size of perSide) {
    const last = runs[runs.length - 1];
    if (last && last.size === size) last.count += 1;
    else runs.push({ size, count: 1 });
  }
  return runs;
}

/** One side's plates in words: "45, 45 and 25", or "3 × 45 and 10" for a long run. */
export function platesInWords(perSide: readonly number[]): string {
  const parts = plateRuns(perSide).map(({ size, count }) =>
    count > 2 ? `${count} × ${size}` : Array.from({ length: count }, () => String(size)).join(', '),
  );
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
