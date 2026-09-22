import type { BarcodeGraphic } from './encode';
import styles from './Barcode.module.css';

/** Quiet zones scanners need around a code: ten module widths for bars, four for QR. */
const BAR_QUIET = 10;
const QR_QUIET = 4;
const BAR_HEIGHT = 60;

/** Runs of set modules, so a code is a few dozen rectangles rather than hundreds. */
function runs(bits: readonly boolean[]): { start: number; length: number }[] {
  const found: { start: number; length: number }[] = [];
  let index = 0;
  while (index < bits.length) {
    if (!bits[index]) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < bits.length && bits[index]) index += 1;
    found.push({ start, length: index - start });
  }
  return found;
}

/** Black on white with crisp edges, sized by its container; no text, so nothing to misread. */
export function BarcodeGraphicSvg({ graphic, label }: { graphic: BarcodeGraphic; label: string }) {
  if (graphic.kind === 'bars') {
    const width = graphic.modules.length + BAR_QUIET * 2;
    const bars = runs([...graphic.modules].map((bit) => bit === '1'));
    return (
      <svg
        className={styles.bars}
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${BAR_HEIGHT}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        data-testid="barcode-graphic"
        data-kind="bars"
      >
        <rect width={width} height={BAR_HEIGHT} fill="#ffffff" />
        {bars.map((bar) => (
          <rect
            key={bar.start}
            x={bar.start + BAR_QUIET}
            y={0}
            width={bar.length}
            height={BAR_HEIGHT}
            fill="#000000"
          />
        ))}
      </svg>
    );
  }
  const side = graphic.size + QR_QUIET * 2;
  const rows = Array.from({ length: graphic.size }, (_, row) =>
    runs(graphic.dark.slice(row * graphic.size, (row + 1) * graphic.size)),
  );
  return (
    <svg
      className={styles.matrix}
      role="img"
      aria-label={label}
      viewBox={`0 0 ${side} ${side}`}
      shapeRendering="crispEdges"
      data-testid="barcode-graphic"
      data-kind="matrix"
    >
      <rect width={side} height={side} fill="#ffffff" />
      {rows.flatMap((cells, row) =>
        cells.map((cell) => (
          <rect
            key={`${row}-${cell.start}`}
            x={cell.start + QR_QUIET}
            y={row + QR_QUIET}
            width={cell.length}
            height={1}
            fill="#000000"
          />
        )),
      )}
    </svg>
  );
}
