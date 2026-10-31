import { useRef, useState } from 'react';
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
  const newButton = useRef<HTMLButtonElement>(null);
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
      <Button
        ref={newButton}
        variant="secondary"
        data-testid="new-preset"
        onClick={() => setEditing('new')}
      >
        New preset
      </Button>
      {editing !== null ? (
        <PresetSheet
          key={editing === 'new' ? 'new' : editing.id}
          preset={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          // The preset gone, its row and its Edit with it: the next step is a new one (the review of
          // the presets: focus was lost).
          onDeleted={() => {
            setEditing(null);
            newButton.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** One preset made or changed: its name and its equipment; a preset of the lifter's own deleted. */
function PresetSheet({
  preset,
  onClose,
  onDeleted,
}: {
  preset: EquipmentPreset | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const store = useAppStore();
  const [name, setName] = useState(preset?.name ?? '');
  const [equipment, setEquipment] = useState<string[]>(() => [...(preset?.equipment ?? [])]);
  const [working, setWorking] = useState<'saving' | 'deleting' | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    setWorking('saving');
    setNameError(null);
    try {
      await store.saveEquipmentPreset({ ...(preset ? { id: preset.id } : {}), name, equipment });
      onClose();
    } catch (caught) {
      setNameError(caught instanceof Error ? caught.message : 'Could not save it.');
    } finally {
      setWorking(null);
    }
  }

  async function remove() {
    if (!preset) return;
    setWorking('deleting');
    setDeleteError(null);
    try {
      await store.deleteEquipmentPreset(preset.id);
      onDeleted();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Could not delete it.');
    } finally {
      setWorking(null);
    }
  }

  const busy = working !== null;
  return (
    <Sheet
      open
      title={preset ? `Edit ${preset.name}` : 'New preset'}
      // Never closed while it saves or deletes: its finish closes it (the review of the presets: one
      // closed early closed the next preset's sheet when it finished).
      onClose={busy ? () => undefined : onClose}
      footer={
        confirming && preset ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              data-testid="preset-delete-confirm"
              onClick={() => void remove()}
            >
              {working === 'deleting' ? 'Deleting…' : 'Delete preset'}
            </Button>
          </>
        ) : (
          <>
            {preset ? (
              <Button variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>
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
              onClick={() => void save()}
            >
              {working === 'saving' ? 'Saving…' : 'Save preset'}
            </Button>
          </>
        )
      }
    >
      {confirming && preset ? (
        <p className={styles.body} role="alert" data-testid="preset-delete-question">
          Delete {preset.name}? The places you filled from it stay as they are.
          {deleteError ? ` ${deleteError}` : ''}
        </p>
      ) : null}
      <Field label="Name" htmlFor="preset-name" error={nameError ?? undefined}>
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
