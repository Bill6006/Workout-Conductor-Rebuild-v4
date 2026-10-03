import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { plateMath } from '../../engine/plateMath/plateMath';
import { PlateLine, PlateStack } from './PlateStack';
import { plateLook, plateRuns, platesInWords } from './plateLook';

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
  it('stands each heavier plate taller, in a colour of its own, its number easy to read', () => {
    for (const [units, sizes] of [
      ['lb', [45, 35, 25, 10, 5, 2.5]],
      ['kg', [25, 20, 15, 10, 5, 2.5, 1.25]],
    ] as const) {
      const looks = sizes.map((size) => plateLook(size, units));
      for (let at = 1; at < looks.length; at += 1) {
        expect(looks[at]!.height, `${units} ${sizes[at]}`).toBeLessThan(looks[at - 1]!.height);
      }
      expect(new Set(looks.map((look) => look.fill)).size).toBe(sizes.length);
      for (const [at, look] of looks.entries()) {
        expect(contrast(look.fill, look.ink), `${units} ${sizes[at]}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // A size the app does not stock is still drawn, plain.
    expect(plateLook(55, 'lb').height).toBeGreaterThan(plateLook(2.5, 'lb').height);
  });

  it('keeps a real plate’s proportions: the 45 the biggest, the 10 tall and thin, not a block', () => {
    const [p45, p35, p25, p10] = [45, 35, 25, 10].map((size) => plateLook(size, 'lb')) as [
      ReturnType<typeof plateLook>,
      ReturnType<typeof plateLook>,
      ReturnType<typeof plateLook>,
      ReturnType<typeof plateLook>,
    ];
    // Diameters as iron plates have them: 45 lb 17.7 in, 10 lb 10.3 in.
    expect(p10.height / p45.height).toBeCloseTo(10.3 / 17.7, 1);
    expect(p10.height / p10.width).toBeGreaterThanOrEqual(2.5);
    // Thickness steps down with the weight.
    expect(p45.width).toBeGreaterThan(p35.width);
    expect(p35.width).toBeGreaterThan(p25.width);
    expect(p25.width).toBeGreaterThan(p10.width);
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
   * Lays the drawing out `across` pixels wide, its bar and weight 76 and its collar 8, as the
   * browser would; returns a way to change the width, to tell the drawing (its ResizeObserver),
   * and to put everything back.
   */
  function laidOut(initial: number): {
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
        return this.dataset.part === 'shaft' ? 76 : this.dataset.part === 'collar' ? 8 : 0;
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
    // 360 px in a wide font: 276 px across, less the bar with its weight (76), the collar (8) and
    // the sleeve's end (12), leaves 180. Seven 45s need 182: drawn once each, the collar covered
    // one (the tenth review), and for one frame before the room was measured (its re-check).
    const layout = laidOut(276);
    try {
      render(<PlateStack result={plateMath(bench, 675, 'lb')} />);
      expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'true');
    } finally {
      layout.restore();
    }
  });

  it('follows the room as the drawing changes width', () => {
    const layout = laidOut(276);
    try {
      render(<PlateStack result={plateMath(bench, 675, 'lb')} />);
      expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'true');
      // Turned to landscape: room for all seven.
      layout.widen(600);
      layout.tell();
      expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'false');
    } finally {
      layout.restore();
    }
  });

  it('never draws a longer sleeve than the designed one, however wide the screen', () => {
    // 600 px across leaves 504, but eight 45s (208 px) are still drawn once with their count.
    const layout = laidOut(600);
    try {
      render(<PlateStack result={plateMath(bench, 765, 'lb')} />);
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
    // Seven 45s a side (675 lb) fit; eight do not.
    render(<PlateStack result={plateMath(bench, 675, 'lb')} />);
    expect(screen.getByRole('img')).toHaveAttribute('data-grouped', 'false');
    expect(drawn()).toHaveLength(7);
    render(<PlateStack result={plateMath(bench, 765, 'lb')} />);
    expect(screen.getAllByRole('img')[1]).toHaveAttribute('data-grouped', 'true');
  });
});

describe('PlateLine', () => {
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
