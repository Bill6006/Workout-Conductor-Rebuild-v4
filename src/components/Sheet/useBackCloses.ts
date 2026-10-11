import { useCallback, useEffect, useId, useRef } from 'react';

/**
 * The phone's Back closes what is open over the page rather than moving the page underneath it:
 * a barcode (Maintenance 26) and every sheet (Maintenance 29, the owner's item 14).
 *
 * Each open view holds one history entry of its own, added as it opens (from the tap that opened
 * it, so the browser keeps it for Back), and each entry lists the views open at it. Back takes the
 * top entry, and the view it held closes; a view opened over another closes first.
 *
 * A view closed any other way (its X, Escape, a Save) gives its entry back once the render settles,
 * as the app's own step back, which closes nothing. A view opened in that same moment takes the
 * entry over instead, and one opened while the step is on its way waits for it, so neither is
 * closed by a step meant for another. Entries left under a page that a link in a view opened, or
 * under a view still open, are stepped past once nothing above them is open, so no Back is spent
 * on a view already gone.
 */

const KEY = 'openViews';

interface View {
  id: string;
  close: () => void;
}

/** The views open now, in the order they opened. */
const open: View[] = [];
/** Steps back the app has taken itself, whose popstate has yet to arrive. */
let ownSteps = 0;
/** Views opened while a step was on its way: their entries are added once it lands. */
let waiting: View[] = [];
let listening = false;

function viewsAt(state: unknown): string[] {
  if (typeof state !== 'object' || state === null) return [];
  const views = (state as Record<string, unknown>)[KEY];
  return Array.isArray(views)
    ? views.filter((view): view is string => typeof view === 'string')
    : [];
}

const viewsNow = () => viewsAt(window.history.state);
const isOpen = (id: string) => open.some((view) => view.id === id);

function stateWith(views: string[]): Record<string, unknown> {
  const current: unknown = window.history.state;
  const base = typeof current === 'object' && current !== null ? current : {};
  return { ...base, [KEY]: views };
}

/** How many entries on top hold only views no longer open. */
function leftOnTop(views: readonly string[]): number {
  let count = 0;
  while (count < views.length && !isOpen(views[views.length - 1 - count] as string)) count += 1;
  return count;
}

function stepBack(count: number): void {
  ownSteps += 1;
  window.history.go(-count);
}

function place(view: View): void {
  const views = viewsNow();
  const top = views.at(-1);
  // Mounted again at once (StrictMode): its entry stands.
  if (top === view.id) return;
  if (top !== undefined && !isOpen(top)) {
    // The entry on top was left by a view just closed, its step not yet taken: this one takes it.
    window.history.replaceState(stateWith([...views.slice(0, -1), view.id]), '');
    return;
  }
  window.history.pushState(stateWith([...views, view.id]), '');
}

function onPop(): void {
  if (ownSteps > 0) {
    // The app's own step back has landed.
    ownSteps -= 1;
    if (ownSteps > 0) return;
    const landed = viewsNow();
    // Views closed while it was on its way: their entries too.
    const left = leftOnTop(landed);
    if (left > 0) {
      stepBack(left);
      return;
    }
    const next = waiting;
    waiting = [];
    for (const view of next) if (isOpen(view.id)) place(view);
    return;
  }
  const views = viewsNow();
  // The view whose entry Back took closes, the one on top first.
  const taken = open.filter((view) => !views.includes(view.id)).reverse();
  for (const view of taken) view.close();
  if (taken.length > 0) {
    // One kept open all the same (a parent that does not close it) holds an entry again.
    window.setTimeout(() => {
      if (ownSteps > 0) return;
      for (const view of taken) if (isOpen(view.id) && !viewsNow().includes(view.id)) place(view);
    }, 0);
  }
  // Landed on entries left by views already gone: stepped past, so this Back is not spent on them.
  const left = leftOnTop(views);
  if (left > 0) stepBack(left);
}

function openView(view: View): void {
  if (!listening) {
    listening = true;
    window.addEventListener('popstate', onPop);
  }
  open.push(view);
  if (ownSteps > 0) {
    waiting.push(view);
    return;
  }
  place(view);
}

function closeView(view: View): void {
  const at = open.indexOf(view);
  if (at >= 0) open.splice(at, 1);
  waiting = waiting.filter((item) => item !== view);
  // After the render: a view mounted again at once keeps its entry, and one opened in its place has
  // taken it over.
  window.setTimeout(() => {
    if (isOpen(view.id) || ownSteps > 0) return;
    const left = leftOnTop(viewsNow());
    if (left > 0) stepBack(left);
  }, 0);
}

/**
 * While `active`, the phone's Back calls `onClose` for this view, once it is the one on top.
 * Returns whether it is the one on top now, for its other closes (Escape) to keep the same order.
 */
export function useBackCloses(onClose: () => void, active = true): () => boolean {
  const id = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return undefined;
    const view: View = { id, close: () => onCloseRef.current() };
    openView(view);
    return () => closeView(view);
  }, [id, active]);

  return useCallback(() => open.at(-1)?.id === id, [id]);
}
