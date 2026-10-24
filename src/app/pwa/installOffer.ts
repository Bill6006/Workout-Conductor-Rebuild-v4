import { useSyncExternalStore } from 'react';

/**
 * Installing the app from its own page (2026-10-24, ported from Life Mirror's fix of 2026-10-03).
 *
 * Every app here shares one site, bill6006.github.io. Once any of them is installed on an Android
 * phone, Chrome's menu ("Install" / "Add to home screen") says "This app is already installed" on
 * every page of the site, and its "open the app instead" fails ("Could not open app"): it asks
 * whether any installed app exists for the site, not for this one. The browser's own install
 * dialog, asked for by the page itself, checks only this app's start page, so it installs. So the
 * browser's offer (`beforeinstallprompt`) is held from the moment the page loads, and Settings
 * shows "Install the app" while it stands. The manifest's id, start_url and scope stay as they are.
 */

/** The browser's offer to install: shown with prompt(), answered in userChoice. */
export interface InstallOffer extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

/** What Settings shows: nothing, the offer, or the offer while the browser's dialog is open. */
export type InstallOfferState = 'none' | 'offered' | 'asking';

let held: InstallOffer | null = null;
let asking = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): InstallOfferState {
  if (asking) return 'asking';
  return held ? 'offered' : 'none';
}

/**
 * Holds the browser's offer from the first moment it is made: it can come before Settings is ever
 * opened. Runs once at start-up (main.tsx); returns the way to stop.
 */
export function watchInstallOffer(target: EventTarget = window): () => void {
  const onOffer = (event: Event) => {
    // The page asks when the lifter taps, instead of the browser asking on its own.
    event.preventDefault();
    held = event as InstallOffer;
    notify();
  };
  const onInstalled = () => {
    held = null;
    notify();
  };
  target.addEventListener('beforeinstallprompt', onOffer);
  target.addEventListener('appinstalled', onInstalled);
  return () => {
    target.removeEventListener('beforeinstallprompt', onOffer);
    target.removeEventListener('appinstalled', onInstalled);
  };
}

export function installOffered(): boolean {
  return held !== null;
}

/**
 * The browser's own install dialog: prompt(), then its answer read from userChoice, then the
 * offer cleared, since an offer is good for one prompt (the browser makes a new one if it can
 * still install). A second tap while the dialog is open asks nothing. 'none' with no offer.
 */
export async function installApp(): Promise<'accepted' | 'dismissed' | 'none'> {
  const offer = held;
  if (!offer || asking) return 'none';
  asking = true;
  notify();
  try {
    await offer.prompt();
    const choice = await offer.userChoice;
    return choice.outcome;
  } finally {
    if (held === offer) held = null;
    asking = false;
    notify();
  }
}

/** Whether the browser is offering to install the app now, for Settings. */
export function useInstallOffer(): InstallOfferState {
  return useSyncExternalStore(subscribe, snapshot, () => 'none');
}

/** For tests: as a fresh start of the app finds it. */
export function resetInstallOfferForTests(): void {
  held = null;
  asking = false;
  notify();
}
