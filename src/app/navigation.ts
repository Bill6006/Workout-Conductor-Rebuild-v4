/**
 * Primary navigation model. Kept free of React component imports so any screen
 * can link to another route without creating an import cycle.
 */

export const ROUTE_IDS = ['today', 'workout', 'progress', 'plan', 'settings'] as const;

export type RouteId = (typeof ROUTE_IDS)[number];

export interface NavItem {
  readonly id: RouteId;
  readonly label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'today', label: 'Today' },
  { id: 'workout', label: 'Workout' },
  { id: 'progress', label: 'Progress' },
  { id: 'plan', label: 'Plan' },
  { id: 'settings', label: 'Settings' },
];

export const DEFAULT_ROUTE_ID: RouteId = 'today';

export function isRouteId(value: string): value is RouteId {
  return (ROUTE_IDS as readonly string[]).includes(value);
}

export function routeHref(id: RouteId): string {
  return `#/${id}`;
}

/**
 * Turns a location hash such as "#/plan", "#/Plan/extra" or "#plan?x=1" into a
 * RouteId. Anything unrecognised falls back to the default route so a stale or
 * mistyped deep link can never leave the shell blank.
 */
export function parseRouteId(hash: string): RouteId {
  const segment = hash.replace(/^#\/?/, '').split(/[/?]/)[0]?.trim().toLowerCase();
  return segment && isRouteId(segment) ? segment : DEFAULT_ROUTE_ID;
}
