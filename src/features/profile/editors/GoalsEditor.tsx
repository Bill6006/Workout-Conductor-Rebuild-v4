import { ChoiceGroup } from '../../../components/Form/ChoiceGroup';
import { Field } from '../../../components/Form/Field';
import { updateProfile } from '../draft';
import { GOAL_OPTIONS, SECONDARY_GOAL_OPTIONS } from '../labels';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

export function GoalsEditor({ draft, onChange }: EditorProps) {
  const { goals } = draft.profile;
  // The goal decides where the volume goes; the programming style decides how each set is done.
  const strengthHint =
    goals.primary === 'strength' && draft.profile.trainingStyle !== 'strength-focus'
      ? 'Decides where the volume goes. For lower reps and longer rests, set Programming style to Strength focus.'
      : 'Decides where the weekly volume goes; Programming style decides how each set is done.';
  return (
    <div className={styles.stack}>
      <Field label="Primary goal" hint={strengthHint}>
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
