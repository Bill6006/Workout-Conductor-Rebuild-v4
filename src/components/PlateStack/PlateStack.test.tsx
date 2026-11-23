import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { plateMath } from '../../engine/plateMath/plateMath';
import { PlateLine, PlateStack } from './PlateStack';
import { plateFill, plateLook, plateRuns, platesInWords } from './plateLook';

/**
 * Maintenance 25, item 8: one end of the bar drawn as it is loaded, the sleeve's end first and the
 * heaviest plate against the collar, each plate in proportion to a real one, coloured by its weight
 * with the weight printed on it; the bar carries its own weight; a line confirms the sum.
 */

const bench = requireExercise('barbell-bench-press');

/** The drawn plates in the order they sit on the sleeve, outermost first. */
function drawn(scope: HTMLElement = screen.getByRole('img')) {
  return [...scope.querySelectorAll<HTMLElement>('[data-plate]')].map((plate) => ({
    size: Number(plate.dataset.plate),
    count: Number(plate.dataset.count),
    text: plate.textContent,
    height: parseFloat(plate.style.height),
    width: parseFloat(plate.style.width),
    fill: plate.style.getPropertyValue('--plate-fill'),
  }));
}

/** The relative luminance of a #rrggbb colour, and the WCAG contrast of two. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

describe('how a plate is drawn', () => {
  it('draws each plate as the owner’s reference does, its number easy to read', () => {
    // Measured from the reference (2026-11-20): the 2.5 and the 5 alike at 77 px, the 10 at 112;
    // 2.5 green, 5 blue and 10 white, at their middles where the number sits.
    expect(
      [2.5, 5, 10].map((size) => [plateLook(size, 'lb').height, plateLook(size, 'lb').fill]),
    ).toEqual([
      [77, '#337a3c'],
      [77, '#19477f'],
      [112, '#e8e9e4'],
    ]);
    // The plates above it taller, up to 150 px so a heavy bar keeps the card short.
    expect([10, 25, 35, 45].map((size) => plateLook(size, 'lb').height)).toEqual([
      112, 128, 140, 150,
    ]);
    for (const [units, sizes] of [
      ['lb', [45, 35, 25, 10, 5, 2.5]],
      ['kg', [25, 20, 15, 10, 5, 2.5, 1.25]],
    ] as const) {
      const looks = sizes.map((size) => plateLook(size, units));
      for (let at = 1; at < looks.length; at += 1) {
        // A lighter plate is never the taller.
        expect(looks[at]!.height, `${units} ${sizes[at]}`).toBeLessThanOrEqual(
          looks[at - 1]!.height,
        );
      }
      expect(Math.max(...looks.map((look) => look.height))).toBe(150);
      for (const [at, look] of looks.entries()) {
        expect(contrast(look.fill, look.ink), `${units} ${sizes[at]}`).toBeGreaterThanOrEqual(4.5);
        // Lit from the top: lighter at the top than at the middle, darker at the bottom.
        expect(luminance(look.top), `${units} ${sizes[at]}`).toBeGreaterThan(luminance(look.fill));
        expect(luminance(look.bottom), `${units} ${sizes[at]}`).toBeLessThan(luminance(look.fill));
      }
    }
    // Lit from the top: the plate's colours from the top down, its middle where the number sits.
    expect(plateFill(plateLook(2.5, 'lb'))).toBe(
      'linear-gradient(180deg, #3f9d56 0%, #337a3c 50%, #233f30 100%)',
    );
    // A size the app does not stock is still drawn, plain.
    expect(plateLook(55, 'lb').height).toBeGreaterThan(plateLook(2.5, 'lb').height);
  });

  it('gives every plate the reference’s thickness, tall and thin, wider only for its number', () => {
    for (const size of [45, 35, 25, 10, 5, 2.5]) {
      expect(plateLook(size, 'lb').width).toBe(34);
      // Its number as large as the reference's: 17.5 px.
      expect(plateLook(size, 'lb').font).toBe(17.5);
    }
    // The smallest still stands over twice its thickness: a plate, not a block.
    expect(plateLook(2.5, 'lb').height / plateLook(2.5, 'lb').width).toBeGreaterThan(2.2);
    // 1.25 is a longer number: its plate is wider.
    expect(plateLook(1.25, 'kg').width).toBeGreaterThan(34);
    for (const size of [25, 20, 15, 10, 5, 2.5]) expect(plateLook(size, 'kg').width).toBe(34);
  });

  it('colours every plate as competition plates are, a pound plate as the kilo plate nearest it', () => {
    // The reference's 2.5 green, 5 blue and 10 white; then 25 green, 35 yellow and 45 blue. In
    // kilograms the 2.5 red, as competition change plates are (the review: a black one vanished
    // into the dark bar and the panel).
    expect([45, 35, 25, 10, 5, 2.5].map((size) => plateLook(size, 'lb').fill)).toEqual([
      '#19477f',
      '#d9ae22',
      '#337a3c',
      '#e8e9e4',
      '#19477f',
      '#337a3c',
    ]);
    expect([25, 20, 15, 10, 5, 2.5, 1.25].map((size) => plateLook(size, 'kg').fill)).toEqual([
      '#b72b28',
      '#19477f',
      '#d9ae22',
      '#337a3c',
      '#e8e9e4',
      '#b72b28',
      '#a5acb5',
    ]);
  });

  it('reads a side in runs and in words', () => {
    expect(plateRuns([45, 45, 25, 5])).toEqual([
      { size: 45, count: 2 },
      { size: 25, count: 1 },
      { size: 5, count: 1 },
    ]);
    expect(platesInWords([45, 25])).toBe('45 and 25');
    expect(platesInWords([45, 45, 45, 10])).toBe('3 × 45 and 10');
    expect(platesInWords([25])).toBe('25');
  });
});

describe('PlateStack', () => {
  it('loads the sleeve with the heaviest plate against the collar, and confirms the sum', () => {
    render(<PlateStack result={plateMath(bench, 290, 'lb')} />);
    const drawing = screen.getByRole('img');
    expect(drawing).toHaveAccessibleName(
      'Load each side with 45, 45, 25, 5 and 2.5, on the 45 lb bar: 290 lb.',
    );
    const plates = drawn();
    // Outermost first: the change plates at the sleeve's end, the 45s against the collar.
    expect(plates.map(({ size, text }) => [size, text])).toEqual([
      [2.5, '2.5'],
      [5, '5'],
      [25, '25'],
      [45, '45'],
      [45, '45'],
    ]);
    const lastPlate = drawing.querySelectorAll('[data-plate]')[4]!;
    expect(lastPlate.parentElement?.parentElement?.nextElementSibling).toHaveClass(/collar/);
    expect(plates[4]!.height).toBeGreaterThan(plates[2]!.height);
    expect(plates[4]!.fill).not.toBe(plates[2]!.fill);
    // Each plate lit from the top, as the reference draws it.
    expect(plates[0]!.fill).toBe(plateFill(plateLook(2.5, 'lb')));
    expect(screen.getByTestId('plate-caption')).toHaveTextContent(
      '290 lb = 45 lb bar + 122.5 lb of plates each side',
    );
    expect(screen.getByTestId('plate-stack')).toHaveAttribute('data-exact', 'true');
  });

  it('prints the bar’s own weight on the bar', () => {
    render(<PlateStack result={plateMath(bench, 185, 'lb')} />);
    expect(within(screen.getByRole('img')).getByTestId('bar-weight')).toHaveTextContent('45 lb');
    const { unmount } = render(
      <PlateStack result={plateMath(requireExercise('ez-bar-curl'), 65, 'lb')} />,
    );
    expect(screen.getAllByTestId('bar-weight')[1]).toHaveTextContent('25 lb');
    unmount();
  });

  it('loads the plates the rack has today, and draws them in kilograms too', () => {
    // No 25s today: 70 a side is two 35s.
    render(<PlateStack result={plateMath(bench, 185, 'lb', [45, 35, 10, 5, 2.5])} />);
    expect(drawn().map(({ size }) => size)).toEqual([35, 35]);
    render(<PlateStack result={plateMath(bench, 100, 'kg')} />);
    expect(screen.getAllByTestId('plate-caption')[1]).toHaveTextContent(
      '100 kg = 20 kg bar + 40 kg of plates each side',
    );
  });

  it('shows the nearest load under a weight the plates cannot make, and says so', () => {
    render(<PlateStack result={plateMath(bench, 100, 'lb', [45, 35, 25, 10, 5])} />);
    expect(screen.getByTestId('plate-stack')).toHaveAttribute('data-exact', 'false');
    expect(drawn().map(({ size }) => size)).toEqual([25]);
    expect(screen.getByTestId('plate-caption')).toHaveTextContent(
      'The plates here make 95 or 105, not 100 lb. Shown: 95 lb, the nearest under it.',
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Load each side with 25, on the 45 lb bar: 95 lb.',
    );
  });

  it('draws the empty bar, and says a weight under it in words', () => {
    const { unmount } = render(<PlateStack result={plateMath(bench, 45, 'lb')} />);
    expect(drawn()).toEqual([]);
    expect(screen.getByRole('img')).toHaveAccessibleName('Empty bar, 45 lb.');
    expect(screen.getByTestId('plate-caption')).toHaveTextContent('Empty bar · 45 lb');
    unmount();
    render(<PlateStack result={plateMath(bench, 30, 'lb')} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('plate-caption')).toHaveTextContent(
      'Below the empty bar (45 lb); use a lighter bar',
    );
  });

  it('draws a long side once per size, its count beside the plate, never over its number', () => {
    // Only 10s here: 345 is fifteen 10s a side.
    render(<PlateStack result={plateMath(bench, 345, 'lb', [10, 5])} />);
    expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'true');
    expect(drawn()).toMatchObject([{ size: 10, count: 15, text: '10' }]);
    const count = screen.getByTestId('plate-count');
    expect(count).toHaveTextContent('×15');
    expect(count.closest('[data-plate]')).toBeNull();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Load each side with 15 × 10, on the 45 lb bar: 345 lb.',
    );
  });

  /**
   * Lays the drawing out `across` pixels wide, the bar's weight `weight` wide (54 in a wide font, 40
   * in the phone's own) and its collar 11, as the browser would; returns a way to change the width,
   * to tell the drawing (its ResizeObserver), and to put everything back.
   */
  function laidOut(
    initial: number,
    weight = 54,
  ): {
    widen: (across: number) => void;
    tell: () => void;
    restore: () => void;
  } {
    let across = initial;
    const watchers: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          watchers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const offset = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.part === 'weight' ? weight : this.dataset.part === 'collar' ? 11 : 0;
      });
    const client = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('role') === 'img' ? across : 0;
      });
    return {
      widen: (next: number) => {
        across = next;
      },
      tell: () =>
        act(() => {
          for (const watcher of watchers) watcher([], {} as ResizeObserver);
        }),
      restore: () => {
        offset.mockRestore();
        client.mockRestore();
        vi.unstubAllGlobals();
      },
    };
  }

  it('groups plates that fit the designed sleeve but not the room this drawing has, from its first frame', () => {
    // 360 px in a wide font: 276 px across, less the sleeve's end with the collar's hairlines (14),
    // the collar (11), and the bar's weight (54) with its ends (36), leaves 161. Five 45s need 174:
    // drawn once each, the collar covered one (the tenth review), and for one frame before the room
    // was measured (its re-check).
    const layout = laidOut(276);
    try {
      render(<PlateStack result={plateMath(bench, 495, 'lb')} />);
      expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'true');
    } finally {
      layout.restore();
    }
  });

  it('follows the room as the drawing changes width', () => {
    const layout = laidOut(276);
    try {
      render(<PlateStack result={plateMath(bench, 495, 'lb')} />);
      expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'true');
      // Turned to landscape: room for all five.
      layout.widen(600);
      layout.tell();
      expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'false');
    } finally {
      layout.restore();
    }
  });

  it('draws five plates where they just fit, in the phone’s own font (the review)', () => {
    // 275 px across, less 14, the collar (11), and the bar's weight (40) with its ends (36), leaves
    // 174: five 45s need 174 (five plates and the four hairlines between them), so all five show.
    const layout = laidOut(275, 40);
    try {
      render(<PlateStack result={plateMath(bench, 495, 'lb')} />);
      expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'false');
      expect(drawn()).toHaveLength(5);
    } finally {
      layout.restore();
    }
  });

  it('never draws a longer sleeve than the designed one, however wide the screen', () => {
    // 600 px across leaves 485, but seven 45s (244 px) are still drawn once with their count.
    const layout = laidOut(600);
    try {
      render(<PlateStack result={plateMath(bench, 675, 'lb')} />);
      expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'true');
    } finally {
      layout.restore();
    }
  });

  it('keeps each number in the caption with its unit, so a line never ends between them', () => {
    render(<PlateStack result={plateMath(bench, 335, 'kg')} />);
    expect(screen.getByTestId('plate-caption').textContent).toBe(
      '335\u00a0kg = 20\u00a0kg bar + 157.5\u00a0kg of plates each side',
    );
  });

  it('keeps them together where the plates cannot make the weight too (the re-check)', () => {
    render(<PlateStack result={plateMath(bench, 188, 'lb')} />);
    expect(screen.getByTestId('plate-caption').textContent).toBe(
      'The plates here make 185 or 190, not 188\u00a0lb. Shown: 185\u00a0lb, the nearest under it.',
    );
  });

  it('draws every plate while they fit on the sleeve, and groups only past that', () => {
    // Six 45s a side (585 lb) fit; seven do not.
    render(<PlateStack result={plateMath(bench, 585, 'lb')} />);
    expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'false');
    expect(drawn()).toHaveLength(6);
    render(<PlateStack result={plateMath(bench, 675, 'lb')} />);
    expect(screen.getAllByRole('img')[1]).toHaveAttribute('data-grouped', 'true');
  });
});

describe('PlateLine', () => {
  it('draws the plates small, each wide enough for its number', () => {
    // The 45 at 40 px, as tall as the small drawing's 45 was before, so the set logger keeps its
    // height (the review); a plate a little wider than its number, as the reference's are.
    render(<PlateLine result={plateMath(bench, 290, 'lb')} />);
    const plates = drawn(screen.getByTestId('plate-line'));
    expect(plates.map(({ size, height, width }) => [size, height, width])).toEqual([
      [2.5, 21, 16],
      [5, 21, 15],
      [25, 34, 15],
      [45, 40, 15],
      [45, 40, 15],
    ]);
  });

  it('draws the same plates small under the logger, outermost first, then "each side"', () => {
    render(<PlateLine result={plateMath(bench, 290, 'lb')} />);
    const line = screen.getByTestId('plate-line');
    expect(line).toHaveAccessibleName(
      'Load each side with 45, 45, 25, 5 and 2.5, on the 45 lb bar: 290 lb.',
    );
    expect(drawn(line).map(({ size }) => size)).toEqual([2.5, 5, 25, 45, 45]);
    expect(line).toHaveTextContent(/each side$/);
  });

  it('groups a long side in small too, its count beside the plate', () => {
    render(<PlateLine result={plateMath(bench, 405, 'lb', [10, 5])} />);
    const line = screen.getByTestId('plate-line');
    expect(line).toHaveAttribute('data-grouped', 'true');
    expect(drawn(line)).toMatchObject([{ size: 10, count: 18, text: '10' }]);
    expect(line).toHaveTextContent('×18');
  });

  it('gives each small change plate room for its weight', () => {
    // At this size a label decides the width: 1.25 needs more room than its thickness gives.
    render(<PlateLine result={plateMath(bench, 67.5, 'kg', [20, 2.5, 1.25])} />);
    const plates = drawn(screen.getByTestId('plate-line'));
    const quarter = plates.find(({ size }) => size === 1.25);
    expect(quarter?.width).toBeGreaterThanOrEqual(18);
    for (const plate of plates) expect(plate.height).toBeGreaterThanOrEqual(17);
  });

  it('stays a line of text where there is nothing to draw', () => {
    for (const [result, text] of [
      [plateMath(bench, 45, 'lb'), 'Empty bar · 45 lb'],
      [plateMath(bench, 188, 'lb'), 'The plates here make 185 or 190, not 188 lb'],
      [
        plateMath(requireExercise('incline-dumbbell-press'), 50, 'lb'),
        '50 lb in each hand (2 × 50)',
      ],
    ] as const) {
      const { unmount } = render(<PlateLine result={result} />);
      expect(screen.getByTestId('plate-line')).toHaveTextContent(text);
      expect(screen.queryByRole('img')).toBeNull();
      unmount();
    }
  });
});
