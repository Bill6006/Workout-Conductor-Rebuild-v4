import { useEffect } from 'react';
import { useAppStore } from '../core/state/useAppStore';
import { readSetupLink } from '../features/settings/setupLink';
import { sectionHref } from './navigation';

/**
 * Applies a personal setup link, then clears it out of the address bar so the
 * token does not linger in history or get forwarded. It watches for the link
 * arriving later too, because opening one while the app is already running only
 * changes the hash and never reloads the page.
 *
 * Whether it worked or not, the browser lands on Settings with the Cloud copy row
 * open, where the card reports the outcome (Maintenance 25). A database already holding somebody else's history
 * is refused here: accepting that is a deliberate tap in Settings, never
 * something a link does on its own.
 */
export function useSetupLink(): void {
  const store = useAppStore();

  useEffect(() => {
    const apply = () => {
      const credentials = readSetupLink(window.location.hash);
      if (!credentials) return;
      // Clear first: the values are in hand, and they should not survive a
      // reload. replaceState rewrites this history entry rather than adding
      // one, so the link is gone from Back as well; it fires no event of its
      // own, so the router is told.
      window.history.replaceState(null, '', sectionHref('settings', 'cloud'));
      window.dispatchEvent(new Event('hashchange'));
      void store
        .setCloudCredentials(credentials)
        .catch((error: unknown) =>
          store.noteSetupLinkFailure(
            error instanceof Error ? error.message : 'That setup link could not be used.',
          ),
        );
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [store]);
}
