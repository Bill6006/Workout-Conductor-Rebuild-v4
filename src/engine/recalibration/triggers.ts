import type { Joint } from '../../catalog/exercises/exerciseSchema';
import type { RecalibrationScope, RecalibrationTrigger, TriggerType } from './types';

/**
 * The trigger registry: every event that can start a recalibration, its
 * default scope, a short label for logs, and what the engine evaluates for it
 * (shown on the calibration overlay). The engine widens a full trigger to
 * partial once work is logged or entries are locked, and never widens a local
 * trigger into a full rebuild.
 */

export interface TriggerDefinition {
  label: string;
  scope: RecalibrationScope;
  evaluating: readonly string[];
}

const CONFLICTS = 'Checking exercise conflicts';
const VALUE = 'Protecting your highest-value sets';
const REMAINING = 'Updating the remaining workout';

export const TRIGGER_REGISTRY: Record<TriggerType, TriggerDefinition> = {
  duration: {
    label: 'Workout length',
    scope: 'full',
    evaluating: [
      VALUE,
      'Balancing strength and hypertrophy',
      'Ranking superset opportunities',
      CONFLICTS,
    ],
  },
  location: {
    label: 'Location',
    scope: 'full',
    evaluating: ['Matching the equipment at this place', VALUE, CONFLICTS],
  },
  equipment: {
    label: 'Equipment profile',
    scope: 'full',
    evaluating: ['Matching the equipment at this place', VALUE, CONFLICTS],
  },
  'equipment-busy': {
    label: 'Equipment busy',
    scope: 'local',
    evaluating: ['Ranking alternatives', 'Keeping the same muscles and role', CONFLICTS],
  },
  replace: {
    label: 'Exercise replaced',
    scope: 'local',
    evaluating: ['Fitting the alternative into this slot', CONFLICTS],
  },
  skip: {
    label: 'Exercise skipped',
    scope: 'local',
    evaluating: [REMAINING, 'Re-estimating the session time'],
  },
  pain: {
    label: 'Pain reported',
    scope: 'local',
    evaluating: [
      'Avoiding stress on the joint you flagged',
      'Ranking gentler alternatives',
      CONFLICTS,
    ],
  },
  uncomfortable: {
    label: 'Marked uncomfortable',
    scope: 'local',
    evaluating: ['Ranking alternatives', 'Keeping the same muscles and role', CONFLICTS],
  },
  pin: {
    label: 'Pinned',
    scope: 'local',
    evaluating: ['Locking the exercise in place'],
  },
  performance: {
    label: 'Reps far from target',
    scope: 'local',
    evaluating: ['Adjusting the next sets', 'Keeping logged sets exactly as entered'],
  },
  'target-weight': {
    label: 'Target weight',
    scope: 'local',
    evaluating: ['Updating the remaining sets'],
  },
  sets: {
    label: 'Sets changed',
    scope: 'local',
    evaluating: ['Updating the remaining sets', 'Re-estimating the session time'],
  },
  'add-warmup': {
    label: 'Ramp set added',
    scope: 'local',
    evaluating: ['Adding a light ramp set', 'Keeping warm-ups out of working totals'],
  },
  'rep-range': {
    label: 'Rep range',
    scope: 'local',
    evaluating: ['Updating the remaining sets'],
  },
  reorder: {
    label: 'Reordered',
    scope: 'local',
    evaluating: ['Moving the row', 'Keeping started work in place'],
  },
  'split-superset': {
    label: 'Superset split',
    scope: 'local',
    evaluating: ['Splitting the pair into straight sets', 'Re-estimating the session time'],
  },
  technique: {
    label: 'Techniques',
    scope: 'full',
    evaluating: ['Ranking superset opportunities', 'Rethinking drop sets and circuits', VALUE],
  },
  profile: {
    label: 'Profile',
    scope: 'full',
    evaluating: ['Rebuilding your workout', 'Balancing strength and hypertrophy', CONFLICTS],
  },
  readiness: {
    label: 'Readiness',
    scope: 'partial',
    evaluating: ['Weighing energy, soreness, and sleep', 'Adjusting sets and effort', REMAINING],
  },
  resume: {
    label: 'Resumed',
    scope: 'partial',
    evaluating: ['Recounting the time left', REMAINING],
  },
  'finish-early': {
    label: 'Finish early',
    scope: 'partial',
    evaluating: ['Keeping everything you logged', 'Closing out the remaining rows'],
  },
  intensity: {
    label: 'Harder or easier',
    scope: 'partial',
    evaluating: ['Adjusting sets and effort', REMAINING],
  },
  'end-by': {
    label: 'End by exact time',
    scope: 'partial',
    evaluating: ['Fitting the session to the exact end time', VALUE, REMAINING],
  },
};

export interface TriggerContext {
  exerciseName?: string;
  locationName?: string;
  equipment?: string;
}

export function jointLabel(joint: Joint): string {
  return joint.replace('-', ' ');
}

/** The overlay title while the engine works on this trigger. */
export function triggerTitle(trigger: RecalibrationTrigger, context: TriggerContext = {}): string {
  const place = context.locationName ?? 'your place';
  const name = context.exerciseName ?? 'the exercise';
  switch (trigger.type) {
    case 'duration':
      return trigger.choice === 'default'
        ? 'Rebuilding your workout at Default time'
        : `Fitting the session to ${trigger.choice} minutes`;
    case 'location':
      return `Rebuilding for ${place}`;
    case 'equipment':
      return `Checking the equipment at ${place}`;
    case 'equipment-busy':
      return `Working around a busy ${context.equipment ?? 'station'}`;
    case 'replace':
      return `Swapping in ${name}`;
    case 'skip':
      return 'Updating the remaining workout';
    case 'pain':
      return `Protecting your ${jointLabel(trigger.joint)}`;
    case 'uncomfortable':
      return 'Finding a more comfortable option';
    case 'pin':
      return trigger.pinned ? `Pinning ${name}` : `Unpinning ${name}`;
    case 'performance':
      return 'Adjusting the next sets';
    case 'target-weight':
      return 'Updating the target weight';
    case 'sets':
      return trigger.workingDelta > 0 ? `Adding a set to ${name}` : `Removing a set from ${name}`;
    case 'add-warmup':
      return `Adding a ramp set to ${name}`;
    case 'rep-range':
      return `Updating the rep target for ${name}`;
    case 'reorder':
      return `Moving ${name} ${trigger.direction}`;
    case 'split-superset':
      return 'Splitting the superset into straight sets';
    case 'technique':
      return trigger.technique === 'supersets'
        ? 'Re-pairing exercises'
        : trigger.technique === 'dropSets'
          ? 'Rethinking drop sets'
          : 'Rethinking circuits';
    case 'profile':
      return 'Rebuilding your workout';
    case 'readiness':
      return 'Adjusting for how you feel today';
    case 'resume':
      return 'Updating the remaining workout';
    case 'finish-early':
      return 'Wrapping up the session';
    case 'intensity':
      return trigger.direction === 'harder' ? 'Making the rest harder' : 'Making the rest easier';
    case 'end-by':
      return trigger.time ? 'Fitting to an exact end time' : 'Returning to the chosen length';
  }
}

export function describeTrigger(
  trigger: RecalibrationTrigger,
  context: TriggerContext = {},
): { title: string; label: string; evaluating: string[]; scope: RecalibrationScope } {
  const definition = TRIGGER_REGISTRY[trigger.type];
  return {
    title: triggerTitle(trigger, context),
    label: definition.label,
    evaluating: [...definition.evaluating],
    scope: definition.scope,
  };
}
