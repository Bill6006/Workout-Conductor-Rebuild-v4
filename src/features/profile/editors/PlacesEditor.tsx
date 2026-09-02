import { Field } from '../../../components/Form/Field';
import { Toggle } from '../../../components/Form/Toggle';
import { nowIso } from '../../../core/time/clock';
import { HOME_LOCATION_ID } from '../../../core/validation/location';
import { hasGymAccess, homeLocation, setGymAccess, setLocationEquipment } from '../draft';
import type { EditorProps } from './EditorProps';
import { EquipmentPicker } from './EquipmentPicker';
import styles from './editors.module.css';

/** Gym access plus the Home location's equipment. Other locations are managed on Plan. */
export function PlacesEditor({ draft, onChange }: EditorProps) {
  const home = homeLocation(draft);
  const gym = hasGymAccess(draft);

  return (
    <div className={styles.stack}>
      <div className={styles.toggles}>
        <Toggle
          label="I have gym access"
          description={
            gym
              ? 'A Gym location with a full commercial setup is saved. Edit it on the Plan tab.'
              : 'Workouts will be built from your home equipment only.'
          }
          checked={gym}
          onChange={(enabled) => onChange(setGymAccess(draft, enabled, nowIso()))}
        />
      </div>
      <Field label="Home equipment" hint="Only exercises that fit this list are used at Home.">
        <EquipmentPicker
          label="Home equipment"
          values={home?.equipment ?? []}
          onChange={(equipment) =>
            onChange(setLocationEquipment(draft, HOME_LOCATION_ID, equipment, nowIso()))
          }
        />
      </Field>
    </div>
  );
}
