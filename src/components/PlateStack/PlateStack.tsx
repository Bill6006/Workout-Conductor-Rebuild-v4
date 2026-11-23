import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { UnitSystem } from '../../core/validation/profile';
import type { PlateMathResult } from '../../engine/plateMath/plateMath';
import { plateFill, plateLook, plateRuns, platesInWords } from './plateLook';
import styles from './PlateStack.module.css';

/**
 * The most room for the plates on the sleeve, in pixels of the full drawing: six of the reference's
 * plates (the owner, 2026-11-20). Past it, each size is drawn once with its count beside it. The
 * drawing measures the room it has as laid out and takes the smaller of the two (see useSleeveRoom).
 */
const SLEEVE_ROOM = 224;
/**
 * The sleeve's bare end, left of the outermost plate (`.sleeve`'s least width), and the hairlines
 * either side of the collar.
 */
const SLEEVE_END = 14;
/** The bar's least room beside its weight: 17.5 px from the collar to the weight, 18 after it. */
const BAR_ENDS = 36;
/** The same for the small drawing under the set logger. */
const COMPACT_ROOM = 120;
/**
 * The small drawing is the full one at this scale: its 45 at 40 px, as tall as the small drawing's 45
 * was before the reference's look (the review), so the set logger keeps its height. Its labels keep
 * a size that can be read.
 */
const COMPACT_SCALE = 40 / 150;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** What one side of the bar holds for this result: its own plates, or the nearest load under it. */
function loaded(result: PlateMathResult): { total: number; perSide: number[] } | null {
  if (result.kind !== 'bar' || result.barWeight === null) return null;
  if (result.perSide.length > 0) return { total: result.target, perSide: result.perSide };
  if (result.nearestBelow) return result.nearestBelow;
  if (result.target === result.barWeight) return { total: result.target, perSide: [] };
  return null;
}

/** The plates in words, for a screen reader and the drawing's label. */
function spoken(total: number, perSide: readonly number[], bar: number, units: string): string {
  return perSide.length === 0
    ? `Empty bar, ${bar} ${units}.`
    : `Load each side with ${platesInWords(perSide)}, on the ${bar} ${units} bar: ${total} ${units}.`;
}

interface Drawn {
  size: number;
  count: number;
}

/**
 * The plates as they go on the sleeve, outermost first (the drawing reads from the sleeve's end to
 * the collar): each plate, or each size once with its count when they would not fit.
 */
function layout(
  perSide: readonly number[],
  units: UnitSystem,
  room: number,
  scale: number,
): { drawn: Drawn[]; grouped: boolean } {
  // The plates and the hairline between each two (the review: not one after the last too).
  const need =
    perSide.reduce((sum, size) => sum + plateWidth(size, units, scale), 0) +
    Math.max(0, perSide.length - 1);
  const grouped = need > room;
  const drawn = grouped ? plateRuns(perSide) : perSide.map((size) => ({ size, count: 1 }));
  return { drawn: [...drawn].reverse(), grouped };
}

function plateWidth(size: number, units: UnitSystem, scale: number): number {
  const look = plateLook(size, units);
  if (scale === 1) return look.width;
  // Small labels still need their room: a digit takes about 0.62 of the type size, a point 0.32.
  const label = String(size);
  const text = [...label].reduce((sum, char) => sum + (char === '.' ? 0.32 : 0.62), 0);
  return Math.max(Math.round(look.width * 0.45), Math.ceil(text * compactFont(size) + 4));
}

/** The small drawing's type: a change plate's longer weight a little smaller, to fit its plate. */
function compactFont(size: number): number {
  return String(size).length >= 3 ? 7.5 : 8.5;
}

function Plate({
  size,
  units,
  scale,
  count = 1,
}: {
  size: number;
  units: UnitSystem;
  scale: number;
  count?: number;
}) {
  const look = plateLook(size, units);
  const style = {
    height: `${Math.max(scale === 1 ? 0 : 17, Math.round(look.height * scale))}px`,
    width: `${plateWidth(size, units, scale)}px`,
    '--plate-fill': plateFill(look),
    color: look.ink,
    fontSize: `${scale === 1 ? look.font : compactFont(size)}px`,
  } as CSSProperties;
  return (
    <span className={styles.plate} style={style} data-plate={size} data-count={count}>
      {size}
    </span>
  );
}

/**
 * The room the sleeve has in this drawing as laid out: the bar's width less the sleeve's end, the
 * collar, and the bar with its weight on it (wider in a wider font). Never more than SLEEVE_ROOM,
 * which stands until the drawing is measured. The tenth review: at 360 px in a wide font the room
 * was under SLEEVE_ROOM, and the collar was drawn over the plate against it.
 */
function useSleeveRoom(): [(bar: HTMLDivElement | null) => void, number] {
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(SLEEVE_ROOM);
  // Measured as the bar is laid out, before it is painted: a frame drawn with the designed room
  // showed the collar over the plates for a moment (the tenth review's re-check).
  const attach = useCallback((node: HTMLDivElement | null) => {
    setBar(node);
    const measured = node ? measureRoom(node) : null;
    if (measured !== null) setRoom(measured);
  }, []);
  useEffect(() => {
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const weight = bar.querySelector<HTMLElement>('[data-part="weight"]');
    if (!weight) return;
    // Then whenever the drawing or the bar's weight changes width.
    const observer = new ResizeObserver(() => {
      const measured = measureRoom(bar);
      if (measured !== null) setRoom(measured);
    });
    observer.observe(bar);
    observer.observe(weight);
    return () => observer.disconnect();
  }, [bar]);
  return [attach, room];
}

/**
 * The room on the sleeve as this bar is laid out; null before it is laid out. The bar runs on past
 * its weight into whatever room the plates leave (the review: ended just after it, the bar read as a
 * box around the weight), so it counts only its weight and its least ends.
 */
function measureRoom(bar: HTMLElement): number | null {
  const collar = bar.querySelector<HTMLElement>('[data-part="collar"]');
  const weight = bar.querySelector<HTMLElement>('[data-part="weight"]');
  if (!collar || !weight || bar.clientWidth === 0) return null;
  const fits = bar.clientWidth - SLEEVE_END - collar.offsetWidth - (weight.offsetWidth + BAR_ENDS);
  return Math.max(0, Math.min(SLEEVE_ROOM, Math.floor(fits)));
}

interface PlateStackProps {
  /** A bar's plate math; anything else has no plates to draw. */
  result: PlateMathResult;
}

/**
 * The plates on the bar (Maintenance 25, item 8), drawn as the owner's reference draws them (the
 * owner, 2026-11-20): one end of the bar as it is loaded, across the panel. The sleeve on the left,
 * the plates on it with the heaviest against the collar, then the collar and the bar, one dark shade
 * throughout, with the bar's own weight on it in plain white. Each plate is lit from the top,
 * coloured by its weight, with the weight printed on it; the same on both sides. A line under it
 * confirms the sum. A weight these plates cannot make shows the nearest load under it and says so.
 */
export function PlateStack({ result }: PlateStackProps) {
  const [attachBar, room] = useSleeveRoom();
  const load = loaded(result);
  const bar = result.barWeight ?? 0;
  const { units } = result;
  if (!load) {
    return (
      <p className={styles.caption} data-testid="plate-caption">
        {result.line}
      </p>
    );
  }
  const exact = load.total === result.target;
  const side = round((load.total - bar) / 2);
  // A number and its unit never part at a line's end ("157.5 / kg" at 360 px, the tenth review).
  const amount = (value: number) => `${value}\u00a0${units}`;
  const { drawn, grouped } = layout(load.perSide, units, room, 1);
  return (
    <figure
      className={styles.stack}
      data-testid="plate-stack"
      data-exact={exact ? 'true' : 'false'}
    >
      <div
        ref={attachBar}
        className={styles.bar}
        role="img"
        aria-label={spoken(load.total, load.perSide, bar, units)}
        data-grouped={grouped ? 'true' : 'false'}
      >
        <span className={styles.sleeve}>
          {drawn.map(({ size, count }, index) => (
            <span key={`${size}-${index}`} className={styles.run}>
              {count > 1 ? (
                <span className={styles.count} data-testid="plate-count">
                  ×{count}
                </span>
              ) : null}
              <Plate size={size} units={units} scale={1} count={count} />
            </span>
          ))}
        </span>
        <span className={styles.collar} data-part="collar" />
        <span className={styles.shaft} data-part="shaft">
          <span className={styles.barWeight} data-part="weight" data-testid="bar-weight">
            {bar} {units}
          </span>
        </span>
      </div>
      <figcaption className={styles.caption} data-testid="plate-caption">
        {exact
          ? load.perSide.length === 0
            ? `Empty bar · ${amount(bar)}`
            : `${amount(load.total)} = ${amount(bar)} bar + ${amount(side)} of plates each side`
          : `${result.line}. Shown: ${amount(load.total)}, the nearest under it.`}
      </figcaption>
    </figure>
  );
}

/**
 * The plates under the set logger (Maintenance 25, item 8): the same drawing in small, the sleeve's
 * end, the plates and the collar, then "each side". Anything a bar does not load, and a weight these
 * plates cannot make, stays one line of text.
 */
export function PlateLine({ result }: PlateStackProps) {
  const bar = result.barWeight ?? 0;
  if (result.kind !== 'bar' || result.perSide.length === 0) {
    return (
      <span className={styles.lineText} data-testid="plate-line">
        {result.line}
      </span>
    );
  }
  const { drawn, grouped } = layout(result.perSide, result.units, COMPACT_ROOM, COMPACT_SCALE);
  return (
    <span
      className={styles.compact}
      role="img"
      aria-label={spoken(result.target, result.perSide, bar, result.units)}
      data-testid="plate-line"
      data-grouped={grouped ? 'true' : 'false'}
    >
      <span className={`${styles.sleeve} ${styles.compactSleeve}`}>
        {drawn.map(({ size, count }, index) => (
          <span key={`${size}-${index}`} className={styles.run}>
            {count > 1 ? <span className={styles.compactCount}>×{count}</span> : null}
            <Plate size={size} units={result.units} scale={COMPACT_SCALE} count={count} />
          </span>
        ))}
      </span>
      <span className={`${styles.collar} ${styles.compactCollar}`} />
      <span className={styles.lineText}>each side</span>
    </span>
  );
}
