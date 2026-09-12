/**
 * A personal setup link: the database address and token travel in the URL
 * fragment, which browsers never send to a server, so the app itself is the
 * only thing that ever reads them. The app applies them, then rewrites the
 * address bar so the values do not sit in history or get forwarded by accident.
 *
 * The link is a key to that person's own history. It is meant to be handed to
 * one person, not posted anywhere.
 */

export interface SetupCredentials {
  url: string;
  token: string;
}

export const SETUP_ROUTE = 'setup';

/** Reads "#/setup?db=...&token=..."; null for any other hash or a missing half. */
export function readSetupLink(hash: string): SetupCredentials | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [path, query] = raw.split('?');
  if (!query) return null;
  if (path?.replace(/^\/+|\/+$/g, '').toLowerCase() !== SETUP_ROUTE) return null;
  const params = new URLSearchParams(query);
  const url = (params.get('db') ?? '').trim();
  const token = (params.get('token') ?? '').trim();
  if (url.length === 0 || token.length === 0) return null;
  return { url, token };
}

/** The link to hand to one person. */
export function buildSetupLink(appUrl: string, credentials: SetupCredentials): string {
  const base = appUrl.split('#')[0] ?? appUrl;
  const params = new URLSearchParams({ db: credentials.url, token: credentials.token });
  return `${base}#/${SETUP_ROUTE}?${params.toString()}`;
}
