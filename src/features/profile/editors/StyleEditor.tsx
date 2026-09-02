import { ChoiceGroup } from '../../../components/Form/ChoiceGroup';
import { Field } from '../../../components/Form/Field';
import { Toggle } from '../../../components/Form/Toggle';
import { updateProfile } from '../draft';
import { REST_STYLE_OPTIONS, STYLE_OPTIONS } from '../labels';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

export function StyleEditor({ draft, onChange }: EditorProps) {
  const { profile } = draft;

  function setTechnique(key: 'supersets' | 'dropSets' | 'circuits', value: boolean) {
    onChange(
      updateProfile(draft, (current) => ({
        ...current,
        techniques: { ...current.techniques, [key]: value },
      })),
    );
  }

  return (
    <div className={styles.stack}>
      <Field label="Programming style">
        <ChoiceGroup
          label="Programming style"
          value={profile.trainingStyle}
          options={STYLE_OPTIONS}
          onChange={(trainingStyle) =>
            onChange(updateProfile(draft, (current) => ({ ...current, trainingStyle })))
          }
        />
      </Field>
      <Field label="Techniques" hint="The engine uses these only when they genuinely help.">
        <div className={styles.toggles}>
          <Toggle
            label="Allow supersets"
            description="Two moves paired to save time without hurting a priority lift."
            checked={profile.techniques.supersets}
            onChange={(value) => setTechnique('supersets', value)}
          />
          <Toggle
            label="Allow drop sets"
            description="A time-efficient hypertrophy tool, never automatic."
            checked={profile.techniques.dropSets}
            onChange={(value) => setTechnique('dropSets', value)}
          />
          <Toggle
            label="Allow circuits"
            description="Only when goal, equipment, and fatigue support them."
            checked={profile.techniques.circuits}
            onChange={(value) => setTechnique('circuits', value)}
          />
        </div>
      </Field>
      <Field label="Rest-time style">
        <ChoiceGroup
          label="Rest-time style"
          value={profile.restStyle}
          options={REST_STYLE_OPTIONS}
          layout="grid-3"
          onChange={(restStyle) =>
            onChange(updateProfile(draft, (current) => ({ ...current, restStyle })))
          }
        />
      </Field>
    </div>
  );
}
