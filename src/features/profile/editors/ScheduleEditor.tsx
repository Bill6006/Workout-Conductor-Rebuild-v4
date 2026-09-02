import { ChipSelect } from '../../../components/Form/ChipSelect';
import { ChoiceGroup } from '../../../components/Form/ChoiceGroup';
import { Field } from '../../../components/Form/Field';
import type { Weekday } from '../../../core/validation/profile';
import { updateProfile } from '../draft';
import {
  DURATION_OPTIONS,
  EXPERIENCE_OPTIONS,
  FREQUENCY_OPTIONS,
  WEEKDAY_OPTIONS,
} from '../labels';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

type FrequencyValue = (typeof FREQUENCY_OPTIONS)[number]['value'];
type DurationValue = (typeof DURATION_OPTIONS)[number]['value'];

function toFrequencyValue(frequency: number): FrequencyValue {
  const clamped = Math.min(6, Math.max(2, frequency));
  return String(clamped) as FrequencyValue;
}

function toDurationValue(minutes: number): DurationValue {
  const candidates = DURATION_OPTIONS.map((option) => Number(option.value));
  const nearest = candidates.reduce((best, candidate) =>
    Math.abs(candidate - minutes) < Math.abs(best - minutes) ? candidate : best,
  );
  return String(nearest) as DurationValue;
}

export function ScheduleEditor({ draft, onChange }: EditorProps) {
  const { profile } = draft;
  const days = profile.schedule.availableDays;

  return (
    <div className={styles.stack}>
      <Field label="Training experience">
        <ChoiceGroup
          label="Training experience"
          value={profile.experience}
          options={EXPERIENCE_OPTIONS}
          layout="grid-3"
          onChange={(experience) =>
            onChange(updateProfile(draft, (current) => ({ ...current, experience })))
          }
        />
      </Field>
      <Field label="Sessions per week">
        <ChoiceGroup
          label="Sessions per week"
          value={toFrequencyValue(profile.schedule.weeklyFrequency)}
          options={FREQUENCY_OPTIONS}
          compact
          onChange={(value) =>
            onChange(
              updateProfile(draft, (current) => ({
                ...current,
                schedule: { ...current.schedule, weeklyFrequency: Number(value) },
              })),
            )
          }
        />
      </Field>
      <Field
        label="Typical workout length"
        hint="This becomes your Default time. 15 / 30 / 45 shortcuts arrive with the engine."
      >
        <ChoiceGroup
          label="Typical workout length"
          value={toDurationValue(profile.schedule.typicalDurationMinutes)}
          options={DURATION_OPTIONS}
          compact
          onChange={(value) =>
            onChange(
              updateProfile(draft, (current) => ({
                ...current,
                schedule: { ...current.schedule, typicalDurationMinutes: Number(value) },
              })),
            )
          }
        />
      </Field>
      <Field
        label="Available days"
        hint={`${days.length} selected · ${profile.schedule.weeklyFrequency} sessions planned`}
      >
        <ChipSelect<Weekday>
          label="Available days"
          values={days}
          options={WEEKDAY_OPTIONS}
          onChange={(availableDays) =>
            onChange(
              updateProfile(draft, (current) => ({
                ...current,
                schedule: {
                  ...current.schedule,
                  availableDays: WEEKDAY_OPTIONS.map((option) => option.value).filter((day) =>
                    availableDays.includes(day),
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
