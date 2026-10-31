import { useState } from 'react';
import { Toggle } from '../../components/Form/Toggle';
import { PlainRow } from '../../components/Group/Group';
import { useToast } from '../../components/Toast/useToast';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';

/**
 * Item 48: the lifter's switch for Life Mirror's daily check-in, off until turned on (the owner,
 * 2026-10-31). With it on, the check-in reads today's Life Mirror check-in from the cloud copy both
 * apps share, read-only, and asks here what Life Mirror does not record.
 */
export function LifeMirrorRow() {
  const store = useAppStore();
  const toast = useToast();
  const on = useAppSelector((state) => state.lifeMirrorLink.on);
  const [saving, setSaving] = useState(false);
  return (
    <PlainRow testId="life-mirror-switch">
      <Toggle
        label="Use Life Mirror’s check-in"
        description="Fills in energy, sleep and motivation from today’s Life Mirror check-in, and reads its stress and mood, when both apps share this cloud copy. Soreness, joints, illness and time are always asked here."
        checked={on}
        disabled={saving}
        onChange={(next) => {
          setSaving(true);
          store
            .setLifeMirrorLink(next)
            .catch((error: unknown) =>
              toast.show(error instanceof Error ? error.message : 'Could not save', 'error'),
            )
            .finally(() => setSaving(false));
        }}
      />
    </PlainRow>
  );
}
