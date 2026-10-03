/** The weight the lifter turned a dial to, and the dial it was turned on. */
export interface LiveWeight {
  dial: string;
  weight: number | null;
}

/**
 * The weight turned on this dial, if any. A new target starts its logger again from the logger's
 * own value, and a dial turned for the target before is never drawn, not even in the moment
 * before the new logger says its value (Maintenance 25, item 8, the ninth review).
 */
export function liveWeightOn(live: LiveWeight | undefined, dialKey: string | null): number | null {
  return live && live.dial === dialKey ? live.weight : null;
}
