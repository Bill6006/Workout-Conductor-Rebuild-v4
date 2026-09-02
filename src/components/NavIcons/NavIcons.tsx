import type { ReactNode } from 'react';
import type { RouteId } from '../../app/navigation';

interface NavIconProps {
  id: RouteId;
}

const STROKE_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Original line icons for the five primary destinations. */
export function NavIcon({ id }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...STROKE_PROPS}>
      {ICON_PATHS[id]}
    </svg>
  );
}

const ICON_PATHS: Record<RouteId, ReactNode> = {
  today: (
    <>
      <path d="M3 18h18" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 6v2.5" />
      <path d="M5.2 9.2l1.6 1.6" />
      <path d="M18.8 9.2l-1.6 1.6" />
    </>
  ),
  workout: (
    <>
      <rect x="2" y="9" width="3" height="6" rx="1" />
      <rect x="5" y="7" width="3" height="10" rx="1" />
      <rect x="16" y="7" width="3" height="10" rx="1" />
      <rect x="19" y="9" width="3" height="6" rx="1" />
      <path d="M8 12h8" />
    </>
  ),
  progress: (
    <>
      <path d="M3 17l5-5 4 4 8-8" />
      <path d="M14 8h6v6" />
    </>
  ),
  plan: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M8 15h4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9" />
      <circle cx="17" cy="7" r="2.5" />
      <path d="M20 12h-9" />
      <circle cx="7" cy="12" r="2.5" />
      <path d="M4 17h7" />
      <circle cx="15" cy="17" r="2.5" />
    </>
  ),
};
