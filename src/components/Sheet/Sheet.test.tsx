import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Sheet } from './Sheet';

/** Maintenance 25: sheets sit on the page itself; focus and the page's scroll come back as they were. */

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <Sheet open={open} title="A sheet" onClose={() => setOpen(false)}>
        <p>inside</p>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('gives focus back to what opened it when it closes (the third review)', async () => {
    const user = userEvent.setup();
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'A sheet' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps the page locked while any sheet is open, and gives its scroll back after the last', () => {
    document.body.style.overflow = '';
    const { rerender } = render(
      <>
        <Sheet open title="First" onClose={() => undefined}>
          <p>one</p>
        </Sheet>
        <Sheet open title="Second" onClose={() => undefined}>
          <p>two</p>
        </Sheet>
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    act(() =>
      rerender(
        <>
          <Sheet open title="First" onClose={() => undefined}>
            <p>one</p>
          </Sheet>
          <Sheet open={false} title="Second" onClose={() => undefined}>
            <p>two</p>
          </Sheet>
        </>,
      ),
    );
    expect(document.body.style.overflow).toBe('hidden');
    act(() =>
      rerender(
        <>
          <Sheet open={false} title="First" onClose={() => undefined}>
            <p>one</p>
          </Sheet>
          <Sheet open={false} title="Second" onClose={() => undefined}>
            <p>two</p>
          </Sheet>
        </>,
      ),
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('gives focus back to an opener that was disabled while it worked, once enabled (the fourth review)', async () => {
    function Working() {
      const [open, setOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      return (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              // As a browser does, a button disabled while focused loses its focus.
              event.currentTarget.blur();
              setBusy(true);
              setOpen(true);
            }}
          >
            Preview it
          </button>
          <Sheet
            open={open}
            title="Working sheet"
            onClose={() => {
              setBusy(false);
              setOpen(false);
            }}
          >
            <p>inside</p>
          </Sheet>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Working />);
    const opener = screen.getByRole('button', { name: 'Preview it' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Working sheet' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
  });

  it('gives focus back to an opener inside another sheet, disabled while it worked (the sixth review)', async () => {
    function Stacked() {
      const [inner, setInner] = useState(false);
      const [busy, setBusy] = useState(false);
      return (
        <Sheet open title="Outer" onClose={() => undefined}>
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.currentTarget.blur();
              setBusy(true);
              setInner(true);
            }}
          >
            Look closer
          </button>
          <Sheet
            open={inner}
            title="Inner"
            onClose={() => {
              setBusy(false);
              setInner(false);
            }}
          >
            <p>inside</p>
          </Sheet>
        </Sheet>
      );
    }
    const user = userEvent.setup();
    render(<Stacked />);
    const opener = screen.getByRole('button', { name: 'Look closer' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Inner' })).toBeInTheDocument();
    act(() => {
      screen
        .getByRole('dialog', { name: 'Inner' })
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.activeElement).toBe(opener);
  });
});
