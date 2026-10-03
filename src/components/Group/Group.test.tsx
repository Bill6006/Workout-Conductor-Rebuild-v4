import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Sheet } from '../Sheet/Sheet';
import { DisclosureRow, Group, LinkRow, PlainRow } from './Group';

/** Maintenance 25, the owner's item 5: the grouped rows that replace a stack of full cards. */

describe('grouped rows', () => {
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  /** The rows brought into view, by their test id. */
  function scrolls(): string[] {
    const seen: string[] = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: Element) {
        seen.push(this.querySelector('[data-testid^="row-"]')?.getAttribute('data-testid') ?? '');
      },
    });
    return seen;
  }

  it('shows a row’s current value closed, and its editor only once opened', async () => {
    const user = userEvent.setup();
    render(
      <Group title="Your training">
        <DisclosureRow name="schedule" title="Schedule" summary="4 a week · 60 min">
          <p>the schedule editor</p>
        </DisclosureRow>
      </Group>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Your training' })).toBeInTheDocument();
    const row = screen.getByTestId('row-schedule');
    expect(row).toHaveTextContent('Schedule4 a week · 60 min');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('the schedule editor')).not.toBeInTheDocument();
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', { name: /Schedule/ });
    expect(panel).toHaveTextContent('the schedule editor');
    expect(row).toHaveAttribute('aria-controls', panel.id);
    // Closed again, the editor stays in the page, hidden: what was typed in it is kept.
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('the schedule editor')).not.toBeVisible();
    expect(row).toHaveAttribute('aria-controls', panel.id);
  });

  it('keeps what was typed in an editor through closing and opening its row (Maintenance 25)', async () => {
    const user = userEvent.setup();
    render(
      <DisclosureRow name="cloud" title="Cloud copy">
        <input aria-label="Token" />
      </DisclosureRow>,
    );
    const row = screen.getByTestId('row-cloud');
    await user.click(row);
    await user.type(screen.getByRole('textbox', { name: 'Token' }), 'half typed');
    await user.click(row);
    await user.click(row);
    expect(screen.getByRole('textbox', { name: 'Token' })).toHaveValue('half typed');
  });

  it('opens a row a link points at and brings it into view, and the lifter can still close it', async () => {
    const seen = scrolls();
    const user = userEvent.setup();
    render(
      <DisclosureRow name="schedule" title="Schedule" linked>
        <p>the schedule editor</p>
      </DisclosureRow>,
    );
    expect(screen.getByText('the schedule editor')).toBeVisible();
    expect(seen).toEqual(['row-schedule']);
    await user.click(screen.getByTestId('row-schedule'));
    expect(screen.getByText('the schedule editor')).not.toBeVisible();
  });

  it('opens a row that needs a look where it is, and brings only the linked row into view', () => {
    const seen = scrolls();
    render(
      <Group title="Your data">
        <DisclosureRow name="cloud" title="Cloud copy" initiallyOpen>
          <p>the cloud copy</p>
        </DisclosureRow>
        <DisclosureRow name="backup" title="Export and import" linked>
          <p>the backup</p>
        </DisclosureRow>
      </Group>,
    );
    expect(screen.getByText('the cloud copy')).toBeVisible();
    expect(screen.getByText('the backup')).toBeVisible();
    expect(seen).toEqual(['row-backup']);
  });

  it('opens and brings into view a row a link names while the page is up', () => {
    const seen = scrolls();
    const rows = (linked: string | null) => (
      <Group title="Your training">
        <DisclosureRow name="goals" title="Goals" linked={linked === 'goals'}>
          <p>the goals editor</p>
        </DisclosureRow>
        <DisclosureRow name="units" title="Units" linked={linked === 'units'}>
          <p>the units editor</p>
        </DisclosureRow>
      </Group>
    );
    const { rerender } = render(rows('goals'));
    expect(seen).toEqual(['row-goals']);
    rerender(rows('units'));
    expect(screen.getByText('the units editor')).toBeVisible();
    // The row opened before stays as it was; only the one named now moves into view.
    expect(screen.getByText('the goals editor')).toBeVisible();
    expect(seen).toEqual(['row-goals', 'row-units']);
  });

  it('links a row to where its thing lives, and keeps quick controls in view', () => {
    render(
      <Group title="Places">
        <PlainRow testId="quick">
          <button type="button">One tap</button>
        </PlainRow>
        <LinkRow title="Where you train" summary="Gym, Home" href="#/plan" testId="places" />
      </Group>,
    );
    expect(screen.getByTestId('places')).toHaveAttribute('href', '#/plan');
    expect(screen.getByTestId('places')).toHaveTextContent('Where you trainGym, Home');
    expect(screen.getByRole('button', { name: 'One tap' })).toBeVisible();
  });

  it('keeps a sheet opened from a row on screen when the row is closed behind it', async () => {
    const user = userEvent.setup();
    render(
      <DisclosureRow name="storage" title="Storage" linked>
        <Sheet open title="Clear temporary data" onClose={() => undefined}>
          <p>what would be removed</p>
        </Sheet>
      </DisclosureRow>,
    );
    expect(screen.getByRole('dialog', { name: 'Clear temporary data' })).toBeVisible();
    // Closed from the keyboard behind the sheet: the sheet stays, and so does the scroll lock
    // it holds, with a way to close it.
    await user.click(screen.getByTestId('row-storage'));
    expect(screen.getByRole('dialog', { name: 'Clear temporary data' })).toBeVisible();
  });
});
