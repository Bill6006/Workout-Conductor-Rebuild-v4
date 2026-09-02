import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE_ID,
  NAV_ITEMS,
  ROUTE_IDS,
  isRouteId,
  parseRouteId,
  routeHref,
} from './navigation';

describe('parseRouteId', () => {
  it.each([
    ['', 'today'],
    ['#', 'today'],
    ['#/', 'today'],
    ['#/today', 'today'],
    ['#/workout', 'workout'],
    ['#/progress', 'progress'],
    ['#/plan', 'plan'],
    ['#/settings', 'settings'],
    ['#/Progress', 'progress'],
    ['#/plan/extra/segments', 'plan'],
    ['#/settings?tab=backup', 'settings'],
    ['#plan', 'plan'],
    ['#/not-a-screen', 'today'],
    ['#/ workout ', 'workout'],
  ])('maps %j to %s', (hash, expected) => {
    expect(parseRouteId(hash)).toBe(expected);
  });

  it('falls back to the default route for garbage input', () => {
    expect(parseRouteId('#/////')).toBe(DEFAULT_ROUTE_ID);
  });
});

describe('navigation model', () => {
  it('exposes the five primary destinations in plan order', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      'today',
      'workout',
      'progress',
      'plan',
      'settings',
    ]);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Today',
      'Workout',
      'Progress',
      'Plan',
      'Settings',
    ]);
  });

  it('keeps ROUTE_IDS and NAV_ITEMS in sync', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([...ROUTE_IDS]);
  });

  it('builds hash hrefs that parse back to the same route', () => {
    for (const id of ROUTE_IDS) {
      expect(parseRouteId(routeHref(id))).toBe(id);
    }
  });

  it('recognises route ids', () => {
    expect(isRouteId('today')).toBe(true);
    expect(isRouteId('history')).toBe(false);
  });
});
