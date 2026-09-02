import { ChoiceGroup } from '../../../components/Form/ChoiceGroup';
import { Field } from '../../../components/Form/Field';
import { updateProfile } from '../draft';
import { GOAL_OPTIONS, SECONDARY_GOAL_OPTIONS } from '../labels';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

export function GoalsEditor({ draft, onChange }: EditorProps) {
  const { goals } = draft.profile;
  return (
    <div className={styles.stack}>
      <Field label="Primary goal" hint="Sets the priority order for every session.">
        <ChoiceGroup
          label="Primary goal"
          value={goals.primary}
          options={GOAL_OPTIONS}
          layout="grid-2"
          onChange={(primary) =>
            onChange(
              updateProfile(draft, (profile) => ({
                ...profile,
                goals: {
                  ...profile.goals,
                  primary,
                  secondary: profile.goals.secondary === primary ? 'none' : profile.goals.secondary,
                },
              })),
            )
          }
        />
      </Field>
      <Field label="Secondary goal" hint="Gets extra attention when time allows.">
        <ChoiceGroup
          label="Secondary goal"
          value={goals.secondary}
          options={SECONDARY_GOAL_OPTIONS.filter((option) => option.value !== goals.primary)}
          layout="grid-2"
          compact
          onChange={(secondary) =>
            onChange(
              updateProfile(draft, (profile) => ({
                ...profile,
                goals: { ...profile.goals, secondary },
              })),
            )
          }
        />
      </Field>
    </div>
  );
}
