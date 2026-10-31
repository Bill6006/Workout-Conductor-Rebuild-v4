import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Field } from '../../components/Form/Field';
import formStyles from '../../components/Form/Form.module.css';
import { Sheet } from '../../components/Sheet/Sheet';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { BUILT_IN_PRESETS, type EquipmentPreset } from '../../core/validation/equipmentPreset';
import { EquipmentPicker } from '../profile/editors/EquipmentPicker';
import styles from './Settings.module.css';

const items = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;

/**
 * Settings, Places: the equipment presets (the owner, 2026-10-31). Home and Full gym are built in,
 * never renamed or deleted; the lifter's own are made, renamed, changed and deleted here, as many as
 * they like. Each shows beside Home and Full gym wherever a place's equipment is set; a tap there
 * copies it in, so changing or deleting a preset later leaves every place as it is.
 */
export function EquipmentPresets() {
  const presets = useAppSelector((state) => state.equipmentPresets);
  const [editing, setEditing] = useState<EquipmentPreset | 'new' | null>(null);
  return (
    <div data-testid="equipment-presets">
      <p className={styles.body}>
        A preset fills a place&rsquo;s equipment in one tap when you set up or edit a place. It is
        copied in: changing or deleting a preset later leaves your places as they are.
      </p>
      <ul className={styles.snapshotList}>
        {BUILT_IN_PRESETS.map((preset) => (
          <li key={preset.name} className={styles.snapshotRow} data-testid="built-in-preset">
            <span className={styles.snapshotText}>
              <strong>{preset.name}</strong>
              {items(preset.equipment.length)} · Built in, always here
            </span>
          </li>
        ))}
        {presets.map((preset) => (
          <li key={preset.id} className={styles.snapshotRow} data-testid="own-preset">
            <span className={styles.snapshotText}>
              <strong>{preset.name}</strong>
              {items(preset.equipment.length)}
            </span>
            <Button variant="secondary" onClick={() => setEditing(preset)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" data-testid="new-preset" onClick={() => setEditing('new')}>
        New preset
      </Button>
      {editing !== null ? (
        <PresetSheet
          key={editing === 'new' ? 'new' : editing.id}
          preset={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/** One preset made or changed: its name and its equipment; a preset of the lifter's own deleted. */
function PresetSheet({ preset, onClose }: { preset: EquipmentPreset | null; onClose: () => void }) {
  const store = useAppStore();
  const [name, setName] = useState(preset?.name ?? '');
  const [equipment, setEquipment] = useState<string[]>(() => [...(preset?.equipment ?? [])]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      title={preset ? `Edit ${preset.name}` : 'New preset'}
      onClose={onClose}
      footer={
        <>
          {preset ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(() => store.deleteEquipmentPreset(preset.id), 'Could not delete it.')
              }
            >
              Delete
            </Button>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            disabled={busy}
            data-testid="preset-save"
            onClick={() =>
              void run(
                () =>
                  store.saveEquipmentPreset({
                    ...(preset ? { id: preset.id } : {}),
                    name,
                    equipment,
                  }),
                'Could not save it.',
              )
            }
          >
            {busy ? 'Saving…' : 'Save preset'}
          </Button>
        </>
      }
    >
      <Field label="Name" htmlFor="preset-name" error={error ?? undefined}>
        <input
          id="preset-name"
          className={formStyles.input}
          type="text"
          value={name}
          maxLength={40}
          placeholder="For example: Hotel gym"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Equipment">
        <EquipmentPicker
          label={`${name.trim() || 'This preset'} equipment`}
          values={equipment}
          onChange={setEquipment}
        />
      </Field>
    </Sheet>
  );
}
