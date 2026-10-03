import { CLOUD_OFFLINE, type CloudStatus } from '../../core/state/appStore';
import { formatDateTime } from '../../core/time/clock';
import { styleChoice, type UserProfile } from '../../core/validation/profile';
import { adviseStyle } from '../../engine/planning/styleAdvice';
import { styleInfo } from '../../engine/planning/styles';
import {
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  PAIN_AREA_OPTIONS,
  REST_STYLE_OPTIONS,
  SECONDARY_GOAL_OPTIONS,
  WEEKDAY_OPTIONS,
} from '../profile/labels';

/**
 * The current value each Settings row shows before it is opened (Maintenance 25, the owner's
 * item 5): what the lifter would otherwise scroll through a full editor to read.
 */

function labelOf<T>(options: readonly { value: T; label: string }[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? String(value);
}

export function goalsSummary(profile: UserProfile): string {
  const primary = labelOf(GOAL_OPTIONS, profile.goals.primary);
  const goals =
    profile.goals.secondary === 'none'
      ? primary
      : `${primary}, then ${labelOf(SECONDARY_GOAL_OPTIONS, profile.goals.secondary).toLowerCase()}`;
  return profile.goals.bodyweight === 'lose' ? `${goals} · losing fat` : goals;
}

/** "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function programmingSummary(profile: UserProfile): string {
  const choice = styleChoice(profile);
  const style =
    choice === 'auto'
      ? `Auto: ${styleInfo(adviseStyle(profile).style).name}`
      : styleInfo(choice).name;
  // The switches allow a technique; the engine plans one only where it helps, and some styles
  // never do, so the line says what is allowed, as the switches do.
  const techniques = [
    profile.techniques.supersets ? 'supersets' : null,
    profile.techniques.dropSets ? 'drop sets' : null,
    profile.techniques.circuits ? 'circuits' : null,
  ].filter((name): name is string => name !== null);
  const rests = `${labelOf(REST_STYLE_OPTIONS, profile.restStyle).toLowerCase()} rests`;
  return [
    style,
    techniques.length > 0
      ? `allows ${listed(techniques)}`
      : 'supersets, drop sets and circuits off',
    rests,
  ].join(' · ');
}

export function daysText(profile: UserProfile): string {
  const days = WEEKDAY_OPTIONS.filter((option) =>
    profile.schedule.availableDays.includes(option.value),
  ).map((option) => option.label);
  return days.length > 0 ? days.join(', ') : 'no days set';
}

export function scheduleSummary(profile: UserProfile): string {
  return [
    labelOf(EXPERIENCE_OPTIONS, profile.experience),
    `${profile.schedule.weeklyFrequency} a week`,
    `${profile.schedule.typicalDurationMinutes} min`,
    daysText(profile),
  ].join(' · ');
}

export function preferencesSummary(profile: UserProfile): string {
  const { preferred, disliked } = profile.exercisePreferences;
  if (preferred.length === 0 && disliked.length === 0) return 'None marked';
  return `${preferred.length} loved · ${disliked.length} avoided`;
}

export function limitationsSummary(profile: UserProfile): string {
  const { painAreas, shoulder, avoidBarbellSquats, notes } = profile.limitations;
  const areas = painAreas.map((area) => labelOf(PAIN_AREA_OPTIONS, area));
  const extra = shoulder.length + (avoidBarbellSquats ? 1 : 0);
  const note = notes.trim();
  const parts = [
    areas.join(', '),
    extra > 0 ? `${extra} movement ${extra === 1 ? 'limit' : 'limits'}` : '',
    // The lifter's own words, as they wrote them.
    note,
  ].filter((part) => part !== '');
  return parts.length > 0 ? parts.join(' · ') : 'None';
}

export function unitsSummary(profile: UserProfile): string {
  const units = profile.units === 'kg' ? 'Kilograms' : 'Pounds';
  return profile.bodyweight === undefined
    ? `${units} · no bodyweight`
    : `${units} · ${profile.bodyweight} ${profile.units} bodyweight`;
}

/** What the cloud copy is doing, in a line, and whether it needs a look (Maintenance 25). */
export function cloudSummary(cloud: CloudStatus): { text: string; attention: boolean } {
  // Offline is a wait, not a failure: the copy goes on once the phone is back online.
  const offline = cloud.lastError === CLOUD_OFFLINE;
  // A failed sync, or a setup link not used (a database that did not answer, say), needs a look,
  // the link's even while off; a token saved or removed clears it.
  if (cloud.notice || cloud.linkError || (cloud.lastError && !offline)) {
    return { text: 'Needs a look: open for what happened', attention: true };
  }
  if (!cloud.configured)
    return { text: 'Off · an optional copy in a database of your own', attention: false };
  if (cloud.syncing) return { text: 'On · copying now', attention: false };
  const changes = `${cloud.pending} ${cloud.pending === 1 ? 'change' : 'changes'}`;
  if (offline) {
    return {
      text: cloud.pending > 0 ? `On · ${changes} to send once online` : 'On · waiting to be online',
      attention: false,
    };
  }
  if (cloud.pending > 0) {
    return { text: `On · ${changes} to send`, attention: false };
  }
  return {
    text: cloud.lastSyncAt ? `On · copied ${formatDateTime(cloud.lastSyncAt)}` : 'On',
    attention: false,
  };
}
