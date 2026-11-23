import type { UnitSystem } from '../../core/validation/profile';

/**
 * How a plate is drawn, seen edge-on on the bar, as the owner's reference draws it (2026-11-20,
 * measured from the picture; Maintenance 25, item 8, before it): every plate the same thickness,
 * widened only where its printed weight needs the room; the change plates alike, 77 px, the 10 lb
 * 112 px, and the plates above it taller, up to 150 px so a heavy bar keeps the card short. Each is
 * lit from the top, lighter at the top and darker at the bottom, in the colours competition plates
 * use (a plate in pounds takes the colour of the kilo plate nearest it, as the reference does: 2.5
 * green, 5 blue, 10 white), and every number is printed at 4.5:1 or more against its plate's middle.
 */
export interface PlateLook {
  /** Height (the plate's diameter) in the full drawing, in pixels. */
  height: number;
  /** Width (the plate's thickness, widened for its label) in the full drawing, in pixels. */
  width: number;
  /** Size of the weight printed on it, in pixels. */
  font: number;
  /** The colour at the plate's middle, where its weight is printed. */
  fill: string;
  /** The colour at its top, and at its bottom: lit from above. */
  top: string;
  bottom: string;
  ink: string;
}

// The reference's three, measured: top, middle and bottom of each plate.
const GREEN = { top: '#3f9d56', fill: '#337a3c', bottom: '#233f30', ink: '#ffffff' };
const BLUE = { top: '#2862a6', fill: '#19477f', bottom: '#16345a', ink: '#ffffff' };
const WHITE = { top: '#fdfdfd', fill: '#e8e9e4', bottom: '#c7c8ca', ink: '#000000' };
// The others lit the same way: about a fifth lighter at the top, two fifths darker at the bottom.
const YELLOW = { top: '#f3ca3f', fill: '#d9ae22', bottom: '#826a17', ink: '#000000' };
const RED = { top: '#d9433f', fill: '#b72b28', bottom: '#6e1a18', ink: '#ffffff' };
const CHROME = { top: '#c3c8cf', fill: '#a5acb5', bottom: '#6f757d', ink: '#000000' };

/** The reference's plate: 34 px thick, its weight in 17.5 px bold. */
const PLATE = { width: 34, font: 17.5 };

const LOOKS: Record<UnitSystem, Record<string, PlateLook>> = {
  lb: {
    '45': { height: 150, ...PLATE, ...BLUE },
    '35': { height: 140, ...PLATE, ...YELLOW },
    '25': { height: 128, ...PLATE, ...GREEN },
    '10': { height: 112, ...PLATE, ...WHITE },
    '5': { height: 77, ...PLATE, ...BLUE },
    '2.5': { height: 77, ...PLATE, ...GREEN },
  },
  // Calibrated plates by their diameters against the pound plates: 25 and 20 kg as the 45 lb
  // (450 mm), 15 kg as the 35, 10 kg as the 25, 5 kg between the 5 and the 10, the change plates
  // as the reference's. The 2.5 kg red, as competition change plates are: a black one vanished
  // into the dark bar and the panel (the review).
  kg: {
    '25': { height: 150, ...PLATE, ...RED },
    '20': { height: 150, ...PLATE, ...BLUE },
    '15': { height: 140, ...PLATE, ...YELLOW },
    '10': { height: 128, ...PLATE, ...GREEN },
    '5': { height: 92, ...PLATE, ...WHITE },
    '2.5': { height: 77, ...PLATE, ...RED },
    '1.25': { height: 77, width: 40, font: 15, ...CHROME },
  },
};

/** A plate of a size this app does not stock: sized between its neighbours, drawn plain. */
function fallbackLook(size: number, units: UnitSystem): PlateLook {
  const sizes = Object.keys(LOOKS[units])
    .map(Number)
    .sort((a, b) => b - a);
  const heaviest = sizes[0] ?? 45;
  const height = Math.round(77 + (73 * Math.min(size, heaviest)) / heaviest);
  return String(size).length > 3
    ? { height, width: 40, font: 15, ...CHROME }
    : { height, ...PLATE, ...CHROME };
}

/** The plate lit from the top: its colours from the top down, its middle where the number sits. */
export function plateFill(look: PlateLook): string {
  return `linear-gradient(180deg, ${look.top} 0%, ${look.fill} 50%, ${look.bottom} 100%)`;
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
