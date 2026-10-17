import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

/**
 * Maintenance 29, the owner's item 14: the phone's Back closes any open sheet, one at a time, and
 * never the screen under it. Each sheet holds an entry of its own, as the barcode's views have since
 * Maintenance 26; a sheet closed any other way gives its entry back, and nothing a closed sheet left
 * spends a later Back.
 */

/** The views the history entry on top holds, oldest first. */
const views = () =>
  ((window.history.state as Record<string, unknown> | null)?.openViews as string[] | undefined) ??
  [];
const back = () => act(() => window.history.back());
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)));
const sheet = (title: string) => screen.queryByRole('dialog', { name: title });

/** Two sheets, the second opened over the first, and a handover from one to the next. */
function Sheets() {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  const [next, setNext] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setFirst(true)}>
        Open first
      </button>
      <Sheet open={first} title="First" onClose={() => setFirst(false)}>
        <button type="button" onClick={() => setSecond(true)}>
          Open second
        </button>
        <button
          type="button"
          onClick={() => {
            // Done here goes straight on to the next sheet, as finishing a workout does.
            setFirst(false);
            setNext(true);
          }}
        >
          Go on
        </button>
        <button
          type="button"
          onClick={() => {
            // Both close at once, as a finish that ends everything open.
            setSecond(false);
            setFirst(false);
          }}
        >
          Close both
        </button>
      </Sheet>
      <Sheet open={second} title="Second" onClose={() => setSecond(false)}>
        <button
          type="button"
          onClick={() => {
            setSecond(false);
            setFirst(false);
          }}
        >
          Done with both
        </button>
      </Sheet>
      <Sheet open={next} title="Next" onClose={() => setNext(false)}>
        <button type="button" onClick={() => setNext(false)}>
          Save
        </button>
      </Sheet>
    </>
  );
}

describe("the phone's Back and the sheets", () => {
  beforeEach(async () => {
    // Whatever an earlier test left open has given its entry back.
    await waitFor(() => expect(views()).toEqual([]));
    act(() => {
      window.location.hash = '#/progress';
    });
    act(() => {
      window.location.hash = '#/today';
    });
  });

  it('closes the sheet on top, then the one under it, never the screen', async () => {
    const user = userEvent.setup();
    render(<Sheets />);
    const before = window.history.length;
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    await user.click(screen.getByRole('button', { name: 'Open second' }));
    // Each holds an entry of its own, added as it opened.
    expect(window.history.length).toBe(before + 2);
    expect(views()).toHaveLength(2);

    back();
    await waitFor(() => expect(sheet('Second')).not.toBeInTheDocument());
    expect(sheet('First')).toBeInTheDocument();
    back();
    await waitFor(() => expect(sheet('First')).not.toBeInTheDocument());
    expect(window.location.hash).toBe('#/today');
    expect(views()).toEqual([]);
  });

  it('gives the entry back when a sheet closes any other way', async () => {
    const user = userEvent.setup();
    render(<Sheets />);
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    expect(views()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(sheet('First')).not.toBeInTheDocument();
    await waitFor(() => expect(views()).toEqual([]));
    // Escape alike.
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(views()).toEqual([]));
    // The next Back leaves the screen as usual.
    back();
    await waitFor(() => expect(window.location.hash).toBe('#/progress'));
  });

  it('gives back both entries in one step when two close at once', async () => {
    const user = userEvent.setup();
    render(<Sheets />);
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    await user.click(screen.getByRole('button', { name: 'Open second' }));
    await user.click(screen.getByRole('button', { name: 'Done with both' }));
    await waitFor(() => expect(views()).toEqual([]));
    expect(window.location.hash).toBe('#/today');
    back();
    await waitFor(() => expect(window.location.hash).toBe('#/progress'));
  });

  it('keeps the next sheet open when one closes and the next opens at once', async () => {
    const user = userEvent.setup();
    render(<Sheets />);
    const before = window.history.length;
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    await user.click(screen.getByRole('button', { name: 'Go on' }));
    expect(sheet('Next')).toBeInTheDocument();
    await settle();
    // Nothing the first sheet left closes the next one, which took its entry over.
    expect(sheet('Next')).toBeInTheDocument();
    expect(views()).toHaveLength(1);
    expect(window.history.length).toBe(before + 1);
    // Its Save gives the entry back; Back after that leaves the screen as usual.
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(views()).toEqual([]));
    back();
    await waitFor(() => expect(window.location.hash).toBe('#/progress'));
  });

  it('keeps the next sheet open when closing one with its X opens the next', async () => {
    // As the end-of-workout confirm's X goes back to the rating sheet.
    function Handover() {
      const [confirm, setConfirm] = useState(true);
      const [rating, setRating] = useState(false);
      return (
        <>
          <Sheet
            open={confirm}
            title="Confirm"
            onClose={() => {
              setConfirm(false);
              setRating(true);
            }}
          >
            <p>sure?</p>
          </Sheet>
          <Sheet open={rating} title="Rating" onClose={() => setRating(false)}>
            <p>how was it</p>
          </Sheet>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Handover />);
    await settle();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await settle();
    expect(sheet('Rating')).toBeInTheDocument();
    expect(views()).toHaveLength(1);
    back();
    await waitFor(() => expect(sheet('Rating')).not.toBeInTheDocument());
    expect(window.location.hash).toBe('#/today');
  });

  it('keeps a sheet opened while the app is taking an entry back, and Back closes only it', async () => {
    // Taps without user-event's own waits, so the step back is truly on its way.
    function One() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Sheet open={open} title="One" onClose={() => setOpen(false)}>
            <p>body</p>
          </Sheet>
        </>
      );
    }
    render(<One />);
    await settle();
    let hashChanges = 0;
    const counted = () => (hashChanges += 1);
    window.addEventListener('hashchange', counted);
    const before = window.history.length;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    // The step back has been taken; its popstate has not arrived.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    });
    await settle();
    await settle();
    expect(sheet('One')).toBeInTheDocument();
    expect(views()).toHaveLength(1);
    expect(window.history.length).toBe(before + 1);
    back();
    await settle();
    expect(sheet('One')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#/today');
    expect(views()).toEqual([]);
    expect(hashChanges).toBe(0);
    window.removeEventListener('hashchange', counted);
  });

  it('steps past the entry a sheet left under a page its link opened (the review)', async () => {
    function Linked() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open place
          </button>
          <Sheet open={open} title="Place" onClose={() => setOpen(false)}>
            <a href="#/plan" onClick={() => setOpen(false)}>
              Manage places
            </a>
          </Sheet>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Linked />);
    await user.click(screen.getByRole('button', { name: 'Open place' }));
    await user.click(screen.getByRole('link', { name: 'Manage places' }));
    await waitFor(() => expect(window.location.hash).toBe('#/plan'));
    // Back from the page the link opened returns to the screen it was opened from.
    back();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    await waitFor(() => expect(views()).toEqual([]));
    // And the Back after it leaves that screen, not spent on the sheet's old entry.
    back();
    await waitFor(() => expect(window.location.hash).toBe('#/progress'));
  });

  it("gives back a sheet's entry when it closes while another's step back is on its way", async () => {
    // A phone's step back lands after the app's next timer, not before it as jsdom's does: held
    // here for 20 ms, so the first sheet closes while the step is truly on its way (Maintenance 30,
    // when the revert of the check after a step lands passed with jsdom's order).
    const go = window.history.go.bind(window.history);
    const held = vi.spyOn(window.history, 'go').mockImplementation((delta?: number) => {
      window.setTimeout(() => go(delta), 20);
    });
    render(<Sheets />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open first' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open second' }));
    });
    await settle();
    expect(views()).toHaveLength(2);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    // The second's step back is on its way when the first closes too.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    });
    await settle();
    await settle();
    expect(sheet('First')).not.toBeInTheDocument();
    await waitFor(() => expect(views()).toEqual([]));
    expect(window.location.hash).toBe('#/today');
    held.mockRestore();
    back();
    await waitFor(() => expect(window.location.hash).toBe('#/progress'));
  });

  it('keeps an entry for a sheet its parent keeps open after Back (the review)', async () => {
    function Stubborn() {
      const [asked, setAsked] = useState(0);
      return (
        <Sheet open title="Busy" onClose={() => setAsked((count) => count + 1)}>
          <p>asked {asked}</p>
        </Sheet>
      );
    }
    render(<Stubborn />);
    await settle();
    expect(views()).toHaveLength(1);
    back();
    await waitFor(() => expect(screen.getByText('asked 1')).toBeInTheDocument());
    await settle();
    // Still open, it holds an entry again: the next Back asks it again, not the screen.
    expect(views()).toHaveLength(1);
    back();
    await waitFor(() => expect(screen.getByText('asked 2')).toBeInTheDocument());
    expect(window.location.hash).toBe('#/today');
  });

  it('adds one entry when StrictMode mounts the sheet twice', async () => {
    const before = window.history.length;
    const { unmount } = render(
      <StrictMode>
        <Sheet open title="Strict" onClose={() => undefined}>
          <p>once</p>
        </Sheet>
      </StrictMode>,
    );
    await settle();
    expect(sheet('Strict')).toBeInTheDocument();
    expect(window.history.length).toBe(before + 1);
    expect(views()).toHaveLength(1);
    unmount();
    await waitFor(() => expect(views()).toEqual([]));
  });
});
