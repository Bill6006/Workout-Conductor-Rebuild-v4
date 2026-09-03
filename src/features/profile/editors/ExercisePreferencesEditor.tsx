import { exerciseNames } from '../../../catalog/exercises/catalog';
import { Field } from '../../../components/Form/Field';
import { TagInput } from '../../../components/Form/TagInput';
import { updateProfile } from '../draft';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

export function ExercisePreferencesEditor({ draft, onChange }: EditorProps) {
  const { preferred, disliked } = draft.profile.exercisePreferences;
  const catalogNames = exerciseNames();

  return (
    <div className={styles.stack}>
      <Field
        label="Preferred exercises"
        hint="Ranked higher whenever they fit the session."
        htmlFor="preferred-exercises"
      >
        <TagInput
          id="preferred-exercises"
          values={preferred}
          suggestions={catalogNames.filter((name) => !disliked.includes(name))}
          placeholder="Type an exercise or tap a suggestion"
          onChange={(next) =>
            onChange(
              updateProfile(draft, (profile) => ({
                ...profile,
                exercisePreferences: {
                  ...profile.exercisePreferences,
                  preferred: next,
                  disliked: profile.exercisePreferences.disliked.filter(
                    (name) => !next.includes(name),
                  ),
                },
              })),
            )
          }
        />
      </Field>
      <Field
        label="Disliked exercises"
        hint="Never suggested, not even as an alternative."
        htmlFor="disliked-exercises"
      >
        <TagInput
          id="disliked-exercises"
          values={disliked}
          suggestions={catalogNames.filter((name) => !preferred.includes(name))}
          placeholder="Type an exercise or tap a suggestion"
          onChange={(next) =>
            onChange(
              updateProfile(draft, (profile) => ({
                ...profile,
                exercisePreferences: {
                  ...profile.exercisePreferences,
                  disliked: next,
                  preferred: profile.exercisePreferences.preferred.filter(
                    (name) => !next.includes(name),
                  ),
                },
              })),
            )
          }
        />
      </Field>
    </div>
  );
}
