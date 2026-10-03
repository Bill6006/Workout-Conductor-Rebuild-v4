import type { MaxPreview } from '../../core/state/appStore';

/**
 * What the preview says: the estimate, then the target the save leaves the lift at today, read
 * from the save's own rebuild (Maintenance 25), with the engine's line for what the place or the
 * lift's logged sets did to it.
 */
export function previewText(
  preview: MaxPreview,
  mode: 'set' | 'max',
  name: string,
  units: string,
  perHand: string,
  offer: boolean,
): string {
  const estimate =
    mode === 'set'
      ? `Estimated max about ${Math.round(preview.e1rm)} ${units}${perHand} from that set.`
      : `Max ${Math.round(preview.e1rm)} ${units}${perHand}.`;
  const target = preview.target;
  const shown =
    target && target.weight !== null
      ? `${target.weight} ${units} × ${target.reps[0]}-${target.reps[1]} reps at RIR ${target.rir}`
      : null;
  const outcome =
    preview.outcome === 'by-hand'
      ? `${name} keeps the weight you set for today. Sets of it you log today count instead of this max.`
      : preview.outcome === 'logged' || preview.outcome === 'under-way'
        ? `${name} is already under way today; this max counts from your next session.`
        : !shown
          ? null
          : preview.outcome === 'first'
            ? `${offer ? 'First target' : 'Today’s target'}: ${shown}.`
            : preview.outcome === 'moved'
              ? `Today’s target: ${shown}.`
              : keptLine(preview, shown);
  return [estimate, outcome, ...preview.lines].filter(Boolean).join(' ');
}

/**
 * A max that leaves the target as the log has it (Maintenance 25), said as it is: the target
 * stays, or today's work before the lift moved it since the plan was made; and why the max does
 * not move it.
 */
function keptLine(preview: MaxPreview, shown: string): string {
  const why =
    preview.outcome === 'held'
      ? preview.heldBy === 'deload'
        ? 'this deload week’s lighter loads round it to the same weight.'
        : preview.heldBy === 'hand'
          ? 'the max asks for more than the weights here and the reps you set allow.'
          : 'the max asks for more than the weights here make.'
      : preview.outcome === 'eased'
        ? 'the lift is lighter today to win back missed reps, and a max does not change that.'
        : 'your logged sets already say as much as this max.';
  return preview.stays
    ? `Today’s target stays ${shown}: ${why}`
    : `Today’s target: ${shown}. ${why.charAt(0).toUpperCase()}${why.slice(1)}`;
}
