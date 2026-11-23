import { expect, test, type Locator, type Page } from '@playwright/test';
import { ensureProfile, expectNoHorizontalOverflow, skipWarmupIfShown } from './helpers';

/**
 * Maintenance 25, item 8, at phone width: the plate buttons stay on one row, in pounds and in
 * kilograms; every weight printed on a plate fits inside it, on the Plates panel and under the
 * logger; and a long side's count sits beside its plate, never over the number.
 */

/**
 * The Linux runner draws text in DejaVu Sans, wider than Windows' Segoe UI or Android's Roboto.
 * Verdana stands in for it on every run, so a row that fits here fits there and on the phone (the
 * tenth review: "1.25" ran past its button at 360 px in the wide font only).
 */
async function wideFont(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const add = () => {
      const style = document.createElement('style');
      style.textContent = '* { font-family: Verdana, sans-serif !important; }';
      document.head.append(style);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  });
}

async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 8_000 });
}

async function openPlates(page: Page): Promise<{ card: Locator; panel: Locator }> {
  const card = page.getByTestId('exercise-card').first();
  await skipWarmupIfShown(page);
  await settle(page);
  const panel = card.getByTestId('plate-math');
  if (!(await panel.isVisible())) await card.getByTestId('plates-tab').click();
  await expect(panel).toBeVisible();
  return { card, panel };
}

async function setDial(page: Page, card: Locator, weight: number): Promise<void> {
  await card.getByTestId('logger-weight').click();
  await page.getByRole('spinbutton', { name: 'Weight' }).fill(String(weight));
  await page.keyboard.press('Enter');
  await expect(card.getByTestId('logger-weight')).toContainText(String(weight));
}

/** Every plate button on one row, inside the panel, each its label's width or wider. */
async function expectOneRow(panel: Locator, count: number): Promise<void> {
  const row = panel.getByTestId('plate-buttons');
  await expect(row.getByRole('button')).toHaveCount(count);
  const boxes = await row.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return {
        label: button.textContent,
        top: box.top,
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
        spills: button.scrollWidth > button.clientWidth,
      };
    }),
  );
  const edge = await panel.evaluate((element) => element.getBoundingClientRect().right);
  for (const box of boxes) {
    expect(Math.abs(box.top - boxes[0]!.top), `${box.label} on the first row`).toBeLessThan(1);
    expect(box.spills, `${box.label} fits its button`).toBe(false);
    expect(box.right, `${box.label} inside the panel`).toBeLessThanOrEqual(edge + 0.5);
    // A comfortable thumb target: never under 44 px tall or 32 px wide.
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(32);
  }
}

/** No plate's printed weight runs past its plate. */
async function expectLabelsFit(scope: Locator): Promise<void> {
  const plates = scope.locator('[data-plate]');
  expect(await plates.count()).toBeGreaterThan(0);
  const spilling = await plates.evaluateAll((all) =>
    all
      .filter((plate) => plate.scrollWidth > plate.clientWidth + 0.5)
      .map((plate) => plate.textContent),
  );
  expect(spilling).toEqual([]);
}

/**
 * The collar stands clear of the plate against it, and the drawing keeps inside its bar: a heavy
 * side that needs more room than the sleeve has here is drawn once per size with its count (the
 * tenth review: at 360 px the collar was drawn over the last plate, its weight half hidden).
 */
async function expectCollarClear(panel: Locator): Promise<void> {
  const bar = panel.getByTestId('plate-stack').getByRole('img');
  await expect(async () => {
    const geometry = await bar.evaluate((element) => {
      const plates = Array.from(element.querySelectorAll('[data-plate]'), (plate) =>
        plate.getBoundingClientRect(),
      );
      const collar = element.querySelector('[data-part="collar"]')!.getBoundingClientRect();
      const shaft = element.querySelector('[data-part="shaft"]')!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return {
        platesRight: Math.max(...plates.map((plate) => plate.right)),
        platesLeft: Math.min(...plates.map((plate) => plate.left)),
        collarLeft: collar.left,
        shaftRight: shaft.right,
        left: box.left,
        right: box.right,
      };
    });
    expect(geometry.platesRight, 'the plates end where the collar begins').toBeLessThanOrEqual(
      geometry.collarLeft + 0.5,
    );
    expect(geometry.platesLeft, 'the outermost plate inside the drawing').toBeGreaterThanOrEqual(
      geometry.left - 0.5,
    );
    expect(geometry.shaftRight, 'the bar and its weight inside the drawing').toBeLessThanOrEqual(
      geometry.right + 0.5,
    );
  }).toPass({ timeout: 4_000 });
  await expectLabelsFit(panel.getByTestId('plate-stack'));
}

/**
 * The look of the owner's reference (2026-11-20; the review): the bar one flat dark shade, as thick
 * as the sleeve, its weight plain white with nothing around it and the bar running on past it; the
 * collar 11 by 41 px; each plate lit from the top.
 */
async function expectReferenceLook(panel: Locator): Promise<void> {
  const look = await panel
    .getByTestId('plate-stack')
    .getByRole('img')
    .evaluate((bar) => {
      const collar = bar.querySelector('[data-part="collar"]')!;
      const sleeve = getComputedStyle(collar.previousElementSibling!, '::before');
      const shaft = bar.querySelector('[data-part="shaft"]')!;
      const weight = bar.querySelector('[data-part="weight"]')!;
      const weightStyle = getComputedStyle(weight);
      return {
        sleeve: [sleeve.backgroundColor, sleeve.height],
        collar: [
          getComputedStyle(collar).backgroundColor,
          collar.getBoundingClientRect().width,
          collar.getBoundingClientRect().height,
        ],
        shaft: [getComputedStyle(shaft).backgroundColor, shaft.getBoundingClientRect().height],
        weight: [
          weightStyle.color,
          weightStyle.backgroundColor,
          weightStyle.borderTopWidth,
          weightStyle.fontSize,
        ],
        runsOn: shaft.getBoundingClientRect().right - weight.getBoundingClientRect().right,
        plates: Array.from(
          bar.querySelectorAll('[data-plate]'),
          (plate) => getComputedStyle(plate).backgroundImage,
        ),
      };
    });
  expect(look.sleeve).toEqual(['rgb(51, 53, 66)', '30px']);
  expect(look.collar).toEqual(['rgb(51, 53, 66)', 11, 41]);
  expect(look.shaft).toEqual(['rgb(51, 53, 66)', 30]);
  expect(look.weight).toEqual(['rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)', '0px', '17.5px']);
  expect(look.runsOn, 'the bar runs on past its weight').toBeGreaterThan(30);
  for (const plate of look.plates) expect(plate).toMatch(/^linear-gradient\(/);
}

test.describe('the plates at phone width', () => {
  test('pounds: the buttons on one row in both modes, every weight inside its plate, a long side counted beside it', async ({
    page,
  }) => {
    await wideFont(page);
    await ensureProfile(page);
    await page.getByTestId('start-workout').click();
    const { card, panel } = await openPlates(page);
    await expectOneRow(panel, 6);
    await panel.getByTestId('plates-mode-default').click();
    await expectOneRow(panel, 6);

    // 80: the reference's own load, a 2.5, a 5 and a 10 a side, in the reference's look.
    await setDial(page, card, 80);
    await expect(panel.getByTestId('plate-stack').locator('[data-plate]')).toHaveText([
      '2.5',
      '5',
      '10',
    ]);
    await expectReferenceLook(panel);

    // 290: a 2.5, a 5, a 25 and two 45s a side, drawn on the panel and small under the logger. At
    // 412 px the five fit. At 360 px whether they fit beside the bar's weight turns on the font that
    // draws "45 lb" (in Verdana they don't, in the runner's font they do): where they don't, the two
    // 45s are drawn once with their count beside them, and either way the drawing fits.
    await setDial(page, card, 290);
    const bar290 = panel.getByTestId('plate-stack').getByRole('img');
    await expect(async () => {
      const grouped = (await bar290.getAttribute('data-grouped')) === 'true';
      if (test.info().project.name !== 'android-360') expect(grouped, 'five fit at 412 px').toBe(false);
      expect(await bar290.locator('[data-plate]').allTextContents()).toEqual(
        grouped ? ['2.5', '5', '25', '45'] : ['2.5', '5', '25', '45', '45'],
      );
      if (grouped) expect(await panel.getByTestId('plate-count').textContent()).toBe('×2');
      else expect(await panel.getByTestId('plate-count').count()).toBe(0);
    }).toPass({ timeout: 5_000 });
    await expectCollarClear(panel);
    await expectLabelsFit(card.getByTestId('logger-helper'));
    await expect(panel.getByTestId('bar-weight')).toHaveText('45 lb');

    // 625: six 45s and two 10s a side, too many to draw one by one: each size once, its count beside.
    await setDial(page, card, 625);
    await expectCollarClear(panel);

    // Only 10s and 5s at the gym: 405 is eighteen 10s a side, one plate drawn with its count.
    for (const plate of ['45', '35', '25', '2.5']) {
      await panel.getByTestId(`plate-${plate}`).click();
      await settle(page);
    }
    await setDial(page, card, 405);
    const bar = panel.getByTestId('plate-stack').getByRole('img');
    await expect(bar).toHaveAttribute('data-grouped', 'true');
    const count = bar.getByTestId('plate-count');
    await expect(count).toHaveText('×18');
    const [countBox, plateBox] = await Promise.all([
      count.boundingBox(),
      bar.locator('[data-plate="10"]').boundingBox(),
    ]);
    expect(countBox && plateBox).toBeTruthy();
    // Beside the plate, not over its number.
    expect(countBox!.x + countBox!.width).toBeLessThanOrEqual(plateBox!.x + 0.5);
    await expect(card.getByTestId('logger-helper')).toContainText('×18');
    await expectLabelsFit(card.getByTestId('logger-helper'));
    await expectNoHorizontalOverflow(page);
  });

  test('kilograms: seven buttons on one row, the 1.25 printed inside its plate', async ({
    page,
  }) => {
    await wideFont(page);
    await ensureProfile(page);
    await page.goto('./#/settings/units');
    await page.getByRole('radio', { name: /Kilograms/ }).click();
    await expect(page.getByTestId('settings-save-status')).toHaveText(
      'Saved and verified on this device',
    );
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Today' })
      .click();
    await page.getByTestId('start-workout').click();
    const { card, panel } = await openPlates(page);
    await expect(card.getByRole('button', { name: /^Increase weight by .* kg$/ })).toBeVisible();
    await expectOneRow(panel, 7);
    await panel.getByTestId('plates-mode-default').click();
    await expectOneRow(panel, 7);

    // 67.5: a 1.25, a 2.5 and a 20 a side.
    await setDial(page, card, 67.5);
    await expect(panel.getByTestId('plate-stack').locator('[data-plate]')).toHaveText([
      '1.25',
      '2.5',
      '20',
    ]);
    await expectLabelsFit(panel.getByTestId('plate-stack'));
    await expectLabelsFit(card.getByTestId('logger-helper'));
    await expect(panel.getByTestId('bar-weight')).toHaveText('20 kg');

    // 335: six 25s, a 5 and a 2.5 a side.
    await setDial(page, card, 335);
    await expectCollarClear(panel);
    await expectNoHorizontalOverflow(page);
  });
});
