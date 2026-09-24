/**
 * Lasting swaps (Maintenance 22): an exercise the lifter swapped in and chose to keep for a few
 * weeks. Wherever the plan would pick the exercise swapped out, it picks the one swapped in,
 * where that one fits the place; elsewhere the plan is unchanged. Kept in the meta store, like
 * the coach focus, and backed up.
 *
 * Why weeks and not every session: a review of exercise variation found that changing exercises
 * in a planned way can help, while changing them too often can hold gains back (Kassiano et al.,
 * 2022, Journal of Strength and Conditioning Research, PMID 35438660). Four weeks is a judgement
 * within that finding: long enough to progress on the new exercise, short enough that the plan's
 * own pick comes back. No study set the number.
 */

export const LASTING_SWAPS_ID = 'lasting-swaps';
export const SWAP_WEEKS = 4;

const WEEK_MS = 7 * 86_400_000;

export interface LastingSwap {
  /** The exercise swapped out. */
  from: string;
  /** The exercise the plan uses in its place. */
  to: string;
  setAt: string;
  until: string;
}

export interface LastingSwaps {
  id: typeof LASTING_SWAPS_ID;
  swaps: LastingSwap[];
}

export function swapIsPast(swap: LastingSwap, now: string): boolean {
  return Date.parse(now) >= Date.parse(swap.until);
}

/**
 * The swaps with one added. It replaces any swap of the same exercise. A swap that led to `from`
 * now leads to `to` for the same weeks as this one, so a swap of a swapped-in exercise lands on the
 * latest pick and lasts as long as the switch says. A swap exactly
 * back (`to` kept in place of `from` while `from` was kept in place of `to`) ends the first one
 * instead of adding a second. Other swaps stay as they were.
 */
export function withSwap(
  swaps: readonly LastingSwap[],
  from: string,
  to: string,
  now: string,
): LastingSwap[] {
  const back = swaps.some((swap) => swap.from === to && swap.to === from);
  const until = new Date(Date.parse(now) + SWAP_WEEKS * WEEK_MS).toISOString();
  const others = swaps
    .filter((swap) => swap.from !== from && !(swap.from === to && swap.to === from))
    .map((swap) => (swap.to === from ? { ...swap, to, setAt: now, until } : swap))
    .filter((swap) => swap.from !== swap.to);
  return from === to || back ? others : [...others, { from, to, setAt: now, until }];
}

export function withoutSwap(swaps: readonly LastingSwap[], from: string): LastingSwap[] {
  return swaps.filter((swap) => swap.from !== from);
}

/**
 * Reads a stored record tolerantly: a malformed or past swap reads as none. A swap naming an
 * exercise this copy does not know (a custom one not synced here yet) is kept, so saving on this
 * device never deletes it for the others; the plan and the Plan tab skip it.
 */
export function parseLastingSwaps(raw: unknown, now: string): LastingSwap[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { swaps?: unknown }).swaps;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown): LastingSwap[] => {
    if (!item || typeof item !== 'object') return [];
    const { from, to, setAt, until } = item as Partial<LastingSwap>;
    if (typeof from !== 'string' || typeof to !== 'string' || typeof until !== 'string') return [];
    if (from === to) return [];
    if (Number.isNaN(Date.parse(until))) return [];
    const swap: LastingSwap = { from, to, setAt: typeof setAt === 'string' ? setAt : now, until };
    return swapIsPast(swap, now) ? [] : [swap];
  });
}

/**
 * Takes back what one change did to the kept swaps (`before` and `after` it), leaving alone any
 * swap changed since, such as one stopped on the Plan tab.
 */
export function undoSwaps(
  current: readonly LastingSwap[],
  before: readonly LastingSwap[],
  after: readonly LastingSwap[],
): LastingSwap[] {
  const byFrom = (list: readonly LastingSwap[]) => new Map(list.map((swap) => [swap.from, swap]));
  const same = (a?: LastingSwap, b?: LastingSwap) => a?.to === b?.to && a?.until === b?.until;
  const was = byFrom(before);
  const made = byFrom(after);
  const now = byFrom(current);
  for (const from of new Set([...was.keys(), ...made.keys()])) {
    // Changed since this change: left as it is now.
    if (!same(now.get(from), made.get(from))) continue;
    const previous = was.get(from);
    if (previous) now.set(from, previous);
    else now.delete(from);
  }
  return [...now.values()];
}

/** Whether two lists keep the same swaps, whatever their order. */
export function sameSwaps(a: readonly LastingSwap[], b: readonly LastingSwap[]): boolean {
  const key = (list: readonly LastingSwap[]) =>
    list
      .map((swap) => `${swap.from}>${swap.to}@${swap.until}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}

export function lastingSwapsRecord(swaps: readonly LastingSwap[]): LastingSwaps {
  return { id: LASTING_SWAPS_ID, swaps: [...swaps] };
}
