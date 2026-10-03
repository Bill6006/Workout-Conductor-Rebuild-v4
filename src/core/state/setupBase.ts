import type { LocationProfile } from '../validation/location';
import type { UserProfile } from '../validation/profile';

/**
 * What a setup run starts from: the profile and the places as they stand. Setup writes only over
 * the very data it began from, and a run left part-way is resumed only while that data still
 * stands (Maintenance 25, the tenth review's fifth and sixth re-checks: a draft resumed later, or
 * a wizard left open while the cloud copy brought the data back, wrote what it had shown over what
 * had come). With no readable profile the places still count, so places that come back during a
 * first setup are never written over (the tenth re-check); null with neither.
 */
export function setupBase(
  profile: UserProfile | null,
  locations: readonly LocationProfile[],
): string | null {
  const places = locations
    .map((location) => `${location.id}@${location.updatedAt}`)
    .sort()
    .join(',');
  if (!profile) return places.length > 0 ? `none|${places}` : null;
  return `${profile.updatedAt}|${places}`;
}

/**
 * A setup cut off part-way (a full disk, say): what it wrote stays, and `left` is what setup starts
 * from now, the disk as setup's own writes left it, so a Finish again goes through, and a setup
 * reopened without a reload resumes unless its own profile write had landed. A place another
 * window changed meanwhile still makes Finish refuse; a profile changed in that moment is taken as
 * setup's own, as in any Finish (the tenth review's eleventh to fifteenth re-checks).
 */
export class SetupInterruptedError extends Error {
  readonly left: string | null;

  constructor(cause: unknown, left: string | null) {
    super(cause instanceof Error ? cause.message : 'Saving failed.', { cause });
    this.name = 'SetupInterruptedError';
    this.left = left;
  }
}
