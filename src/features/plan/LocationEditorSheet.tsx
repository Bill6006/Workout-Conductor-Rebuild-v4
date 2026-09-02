import { useState } from 'react';
import { TRAVEL_DEFAULT_EQUIPMENT } from '../../catalog/equipment/equipment';
import { Button } from '../../components/Button/Button';
import { ChoiceGroup } from '../../components/Form/ChoiceGroup';
import { Field } from '../../components/Form/Field';
import { TextArea } from '../../components/Form/TextArea';
import { Sheet } from '../../components/Sheet/Sheet';
import { nowIso } from '../../core/time/clock';
import {
  GYM_LOCATION_ID,
  HOME_LOCATION_ID,
  createLocation,
  type LocationKind,
  type LocationProfile,
} from '../../core/validation/location';
import { EquipmentPicker } from '../profile/editors/EquipmentPicker';
import { LOCATION_KIND_OPTIONS } from '../profile/labels';
import formStyles from '../../components/Form/Form.module.css';

interface LocationEditorSheetProps {
  open: boolean;
  location: LocationProfile | null;
  onClose: () => void;
  onSave: (location: LocationProfile) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

interface EditorFields {
  name: string;
  kind: LocationKind;
  equipment: string[];
  notes: string;
}

function fieldsFrom(location: LocationProfile | null): EditorFields {
  return location
    ? {
        name: location.name,
        kind: location.kind,
        equipment: [...location.equipment],
        notes: location.notes,
      }
    : { name: '', kind: 'travel', equipment: [...TRAVEL_DEFAULT_EQUIPMENT], notes: '' };
}

/** Add or edit one location profile. Home and Gym keep their ids; Home cannot be deleted. */
export function LocationEditorSheet({
  open,
  location,
  onClose,
  onSave,
  onDelete,
}: LocationEditorSheetProps) {
  const [fields, setFields] = useState<EditorFields>(() => fieldsFrom(location));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBuiltIn = location?.id === HOME_LOCATION_ID || location?.id === GYM_LOCATION_ID;

  async function save() {
    if (!fields.name.trim()) {
      setError('Give this place a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const stamp = nowIso();
      const next = location
        ? {
            ...location,
            name: fields.name.trim(),
            kind: fields.kind,
            equipment: fields.equipment,
            notes: fields.notes,
            updatedAt: stamp,
          }
        : createLocation(
            {
              name: fields.name,
              kind: fields.kind,
              equipment: fields.equipment,
              notes: fields.notes,
            },
            stamp,
          );
      await onSave(next);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this place.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!location || !onDelete) return;
    setBusy(true);
    try {
      await onDelete(location.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete this place.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title={location ? `Edit ${location.name}` : 'Add a place'}
      onClose={onClose}
      footer={
        <>
          {location && onDelete && location.id !== HOME_LOCATION_ID ? (
            <Button variant="secondary" onClick={() => void remove()} disabled={busy}>
              Delete
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save place'}
          </Button>
        </>
      }
    >
      <Field label="Name" htmlFor="location-name" error={error ?? undefined}>
        <input
          id="location-name"
          className={formStyles.input}
          type="text"
          value={fields.name}
          maxLength={40}
          placeholder="For example: Hotel gym"
          onChange={(event) => setFields({ ...fields, name: event.target.value })}
        />
      </Field>
      {!isBuiltIn ? (
        <Field label="Kind">
          <ChoiceGroup
            label="Kind"
            value={fields.kind}
            options={LOCATION_KIND_OPTIONS.filter((option) => option.value !== 'home')}
            layout="grid-3"
            compact
            onChange={(kind) => setFields({ ...fields, kind })}
          />
        </Field>
      ) : null}
      <Field label="Equipment here">
        <EquipmentPicker
          label={`${fields.name || 'This place'} equipment`}
          values={fields.equipment}
          onChange={(equipment) => setFields({ ...fields, equipment })}
        />
      </Field>
      <Field
        label="Notes"
        htmlFor="location-notes"
        hint="Setup limits, busy stations, anything useful."
      >
        <TextArea
          id="location-notes"
          value={fields.notes}
          maxLength={300}
          onChange={(notes) => setFields({ ...fields, notes })}
        />
      </Field>
    </Sheet>
  );
}
