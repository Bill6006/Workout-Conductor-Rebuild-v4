import { useEffect, useMemo } from 'react';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { useNow } from '../../core/time/clock';
import { localDayKey } from '../../core/time/localDate';
import type { LongerOffer } from '../../engine/planning/longerOffer';
import { musclesInWords } from '../../engine/workoutGenerator/generate';

/**
 * "Longer would help" for Today's plan (Maintenance 34): the store's one offer for the inputs it
 * reads, worked out once while they hold, and its showing remembered for the cooldowns.
 */
export function useLongerOffer(): LongerOffer | null {
  const store = useAppStore();
  const session = useAppSelector((state) => state.session);
  const profile = useAppSelector((state) => state.profile);
  const history = useAppSelector((state) => state.readHistory);
  const timeOffers = useAppSelector((state) => state.timeOffers);
  const switches = useAppSelector((state) => state.coachSwitches);
  const locations = useAppSelector((state) => state.locations);
  const resets = useAppSelector((state) => state.learnedResets);
  const day = localDayKey(new Date(useNow()).toISOString());
  const offer = useMemo(
    () => store.longerOfferFor(),
    // Each input the offer reads; the day for the cooldowns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, session, profile, history, timeOffers, switches, locations, resets, day],
  );
  useEffect(() => {
    if (offer) void store.noteLongerShown().catch(() => undefined);
  }, [offer, store]);
  return offer;
}

/** The suggestion's words (the approved proposal: "45 min would close most of this week's chest gap · Use 45 min"). */
export function longerWords(offer: LongerOffer): { text: string; take: string } {
  return {
    text: `${offer.minutes} min would close ${offer.closesAll ? '' : 'most of '}this week’s ${musclesInWords(offer.muscles)} gap`,
    take:
      offer.choice === 'default'
        ? `Use your Default (${offer.minutes} min)`
        : `Use ${offer.minutes} min`,
  };
}
