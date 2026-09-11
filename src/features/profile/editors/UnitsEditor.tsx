import { ChoiceGroup } from '../../../components/Form/ChoiceGroup';
import { Field } from '../../../components/Form/Field';
import { NumberField } from '../../../components/Form/NumberField';
import { updateProfile } from '../draft';
import { SEX_OPTIONS, UNIT_OPTIONS } from '../labels';
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
        hint="Sets the starting weight for lifts you have not logged yet; nothing else reads it."
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
      <Field
        label="Age (optional)"
        hint="With bodyweight and sex, a closer starting estimate. Kept on this device only."
        htmlFor="age"
      >
        <NumberField
          id="age"
          value={profile.age}
          min={13}
          max={100}
          step={1}
          placeholder="Not set"
          onChange={(age) =>
            onChange(
              updateProfile(draft, (current) => {
                const next = { ...current };
                if (age === undefined) {
                  delete next.age;
                } else {
                  next.age = Math.round(age);
                }
                return next;
              }),
            )
          }
        />
      </Field>
      <Field label="Sex (optional)">
        <ChoiceGroup
          label="Sex"
          value={profile.sex ?? 'unspecified'}
          options={SEX_OPTIONS}
          layout="grid-3"
          compact
          onChange={(sex) =>
            onChange(
              updateProfile(draft, (current) => {
                const next = { ...current };
                if (sex === 'unspecified') {
                  delete next.sex;
                } else {
                  next.sex = sex;
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
