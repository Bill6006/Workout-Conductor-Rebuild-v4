import { ChipSelect } from '../../../components/Form/ChipSelect';
import { Field } from '../../../components/Form/Field';
import { TextArea } from '../../../components/Form/TextArea';
import { Toggle } from '../../../components/Form/Toggle';
import type { PainArea, ShoulderLimitation } from '../../../core/validation/profile';
import { updateProfile } from '../draft';
import { PAIN_AREA_OPTIONS, SHOULDER_LIMITATION_OPTIONS } from '../labels';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

export function LimitationsEditor({ draft, onChange }: EditorProps) {
  const { limitations } = draft.profile;

  return (
    <div className={styles.stack}>
      <Field
        label="Pain or discomfort areas"
        hint="Movements that stress these joints are avoided."
      >
        <ChipSelect<PainArea>
          label="Pain areas"
          values={limitations.painAreas}
          options={PAIN_AREA_OPTIONS}
          onChange={(painAreas) =>
            onChange(
              updateProfile(draft, (profile) => ({
                ...profile,
                limitations: { ...profile.limitations, painAreas },
              })),
            )
          }
        />
      </Field>
      <Field label="Shoulder limitations">
        <ChipSelect<ShoulderLimitation>
          label="Shoulder limitations"
          values={limitations.shoulder}
          options={SHOULDER_LIMITATION_OPTIONS}
          onChange={(shoulder) =>
            onChange(
              updateProfile(draft, (profile) => ({
                ...profile,
                limitations: { ...profile.limitations, shoulder },
              })),
            )
          }
        />
      </Field>
      <div className={styles.toggles}>
        <Toggle
          label="Avoid barbell squats"
          description="Leg press, hack squat, or goblet squat are used instead."
          checked={limitations.avoidBarbellSquats}
          onChange={(avoidBarbellSquats) =>
            onChange(
              updateProfile(draft, (profile) => ({
                ...profile,
                limitations: { ...profile.limitations, avoidBarbellSquats },
              })),
            )
          }
        />
      </div>
      <Field
        label="Notes"
        hint="Anything else the coach should respect."
        htmlFor="limitation-notes"
      >
        <TextArea
          id="limitation-notes"
          value={limitations.notes}
          maxLength={500}
          placeholder="For example: left knee dislikes deep lunges"
          onChange={(notes) =>
            onChange(
              updateProfile(draft, (profile) => ({
                ...profile,
                limitations: { ...profile.limitations, notes },
              })),
            )
          }
        />
      </Field>
    </div>
  );
}
