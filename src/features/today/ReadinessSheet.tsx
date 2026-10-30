import { useState } from 'react';
import { JOINTS, type Joint } from '../../catalog/exercises/exerciseSchema';
import { Button } from '../../components/Button/Button';
import { ChipSelect } from '../../components/Form/ChipSelect';
import { ChoiceGroup } from '../../components/Form/ChoiceGroup';
import { Toggle } from '../../components/Form/Toggle';
import formStyles from '../../components/Form/Form.module.css';
import { Sheet } from '../../components/Sheet/Sheet';
import type { Illness } from '../../engine/readiness/checkIn';
import type { Readiness } from '../../engine/recalibration/types';

interface ReadinessSheetProps {
  open: boolean;
  initial: Readiness | null;
  onClose: () => void;
  onSubmit: (readiness: Readiness) => void;
}

type Scale = '1' | '2' | '3' | '4' | '5';
/** Each dimension in words; the value underneath is still 1 to 5, so the engines are unchanged. */
const WORDS: Record<'energy' | 'soreness' | 'sleep' | 'motivation', readonly string[]> = {
  energy: ['Drained', 'Low', 'Okay', 'Good', 'Full'],
  soreness: ['None', 'Slight', 'Some', 'Sore', 'Wrecked'],
  sleep: ['Poor', 'Short', 'Okay', 'Good', 'Great'],
  motivation: ['None', 'Low', 'Okay', 'Keen', 'Fired up'],
};
const scaleOptions = (words: readonly string[]): { value: Scale; label: string }[] =>
  words.map((label, index) => ({ value: String(index + 1) as Scale, label }));
type Unwell = 'no' | Illness;
/** Unwell today (Maintenance 33): above the neck is trainable, a fever or aches all over are not. */
const UNWELL_OPTIONS: { value: Unwell; label: string }[] = [
  { value: 'no', label: 'No' },
  { value: 'head', label: 'Head cold' },
  { value: 'body', label: 'Fever or aches' },
];
const JOINT_OPTIONS = JOINTS.map((joint) => ({
  value: joint,
  label: joint.replace('-', ' ').replace(/^\w/, (letter) => letter.toUpperCase()),
}));

/**
 * The fast readiness check-in: energy, soreness, sleep, motivation, whether the lifter is unwell,
 * joint discomfort, and time pressure. Applying it runs the readiness recalibration (Maintenance 33,
 * the owner's decision 1): energy, sleep and motivation against the lifter's own lower what the app
 * expects of the first sets, never the plan; a head cold keeps every set 2 or more short of
 * failure; a fever or aches all over make it a rest day; a sore joint and time pressure change the
 * picks and the length, as before.
 */
export function ReadinessSheet({ open, initial, onClose, onSubmit }: ReadinessSheetProps) {
  const [energy, setEnergy] = useState<Scale>(String(initial?.energy ?? 3) as Scale);
  const [soreness, setSoreness] = useState<Scale>(String(initial?.soreness ?? 2) as Scale);
  const [sleep, setSleep] = useState<Scale>(String(initial?.sleep ?? 3) as Scale);
  const [motivation, setMotivation] = useState<Scale>(String(initial?.motivation ?? 3) as Scale);
  const [joints, setJoints] = useState<Joint[]>(initial?.jointDiscomfort ?? []);
  const [timePressure, setTimePressure] = useState(initial?.timePressure ?? false);
  const [unwell, setUnwell] = useState<Unwell>(initial?.illness ?? 'no');

  const scale = (
    label: string,
    words: readonly string[],
    value: Scale,
    onChange: (value: Scale) => void,
  ) => (
    <div>
      <p className={formStyles.label}>{label}</p>
      <ChoiceGroup
        label={label}
        value={value}
        options={scaleOptions(words)}
        onChange={onChange}
        compact
      />
    </div>
  );

  return (
    <Sheet
      open={open}
      title="Quick check-in"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          data-testid="readiness-apply"
          onClick={() =>
            onSubmit({
              energy: Number(energy),
              soreness: Number(soreness),
              sleep: Number(sleep),
              motivation: Number(motivation),
              jointDiscomfort: joints,
              timePressure,
              ...(unwell === 'no' ? {} : { illness: unwell }),
            })
          }
        >
          Apply to today’s workout
        </Button>
      }
    >
      {scale('Energy', WORDS.energy, energy, setEnergy)}
      {scale('Soreness', WORDS.soreness, soreness, setSoreness)}
      {scale('Sleep', WORDS.sleep, sleep, setSleep)}
      {scale('Motivation', WORDS.motivation, motivation, setMotivation)}
      <div>
        <p className={formStyles.label}>Unwell</p>
        <ChoiceGroup
          label="Unwell"
          value={unwell}
          options={UNWELL_OPTIONS}
          onChange={setUnwell}
          compact
        />
      </div>
      <p className={formStyles.label}>Joint discomfort</p>
      <ChipSelect
        label="Joint discomfort"
        values={joints}
        options={JOINT_OPTIONS}
        onChange={setJoints}
      />
      <Toggle
        label="Short on time"
        description="Fits a Default session to 45 minutes; nothing else changes."
        checked={timePressure}
        onChange={setTimePressure}
      />
    </Sheet>
  );
}
