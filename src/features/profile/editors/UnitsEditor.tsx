import { ChoiceGroup } from '../../../components/Form/ChoiceGroup';
import { Field } from '../../../components/Form/Field';
import { NumberField } from '../../../components/Form/NumberField';
import { updateProfile } from '../draft';
import { UNIT_OPTIONS } from '../labels';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

export function UnitsEditor({ draft, onChange }: EditorProps) {
  const { profile } = draft;

  return (
    <div className={styles.stack}>
      <Field label="Unit system">
        <ChoiceGroup
          label="Unit system"
          value={profile.units}
          options={UNIT_OPTIONS}
          layout="grid-2"
          compact
          onChange={(units) => onChange(updateProfile(draft, (current) => ({ ...current, units })))}
        />
      </Field>
      <Field
        label="Bodyweight (optional)"
        hint="Used for bodyweight-based targets only."
        htmlFor="bodyweight"
      >
        <NumberField
          id="bodyweight"
          value={profile.bodyweight}
          unit={profile.units}
          min={1}
          max={1000}
          step={0.5}
          placeholder="Not set"
          onChange={(bodyweight) =>
            onChange(
              updateProfile(draft, (current) => {
                const next = { ...current };
                if (bodyweight === undefined) {
                  delete next.bodyweight;
                } else {
                  next.bodyweight = bodyweight;
                }
                return next;
              }),
            )
          }
        />
      </Field>
    </div>
  );
}
