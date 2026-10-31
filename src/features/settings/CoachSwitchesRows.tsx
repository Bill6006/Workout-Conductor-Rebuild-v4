import { useState } from 'react';
import { Toggle } from '../../components/Form/Toggle';
import { PlainRow } from '../../components/Group/Group';
import { useToast } from '../../components/Toast/useToast';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import type { CoachSwitch } from '../../core/validation/coachSwitches';

/**
 * The kinds of the coach's newer advice, each turned off or on here (Maintenance 34; the approved
 * proposal's cooldowns: "you can turn a card type off in Settings"). Each is on until turned off,
 * kept with the rest of what the app keeps, and copied to the cloud.
 */
const KINDS: readonly { kind: CoachSwitch; label: string; description: string }[] = [
  {
    kind: 'tooSoon',
    label: '"Too soon" warnings',
    description:
      'A card when a muscle comes back hard inside its recovery window, with a lighter option.',
  },
  {
    kind: 'longer',
    label: '"Longer would help"',
    description:
      'A line beside the length when the next length up would close most of a week’s gap.',
  },
  {
    kind: 'goalsTime',
    label: 'Goals and time',
    description:
      'A card after three weeks of your goals’ muscles under 4 sets a week at short lengths.',
  },
];

export function CoachSwitchesRows() {
  const store = useAppStore();
  const toast = useToast();
  const switches = useAppSelector((state) => state.coachSwitches);
  const [saving, setSaving] = useState<CoachSwitch | null>(null);
  return (
    <>
      {KINDS.map(({ kind, label, description }) => (
        <PlainRow key={kind} testId={`coach-switch-${kind}`}>
          <Toggle
            label={label}
            description={description}
            checked={switches[kind]}
            disabled={saving === kind}
            onChange={(on) => {
              setSaving(kind);
              store
                .setCoachSwitch(kind, on)
                .catch((error: unknown) =>
                  toast.show(error instanceof Error ? error.message : 'Could not save', 'error'),
                )
                .finally(() => setSaving(null));
            }}
          />
        </PlainRow>
      ))}
    </>
  );
}
