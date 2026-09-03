import { useState } from 'react';
import { JOINTS, type Joint } from '../../catalog/exercises/exerciseSchema';
import { Button } from '../../components/Button/Button';
import { ChipSelect } from '../../components/Form/ChipSelect';
import { ChoiceGroup } from '../../components/Form/ChoiceGroup';
import { Toggle } from '../../components/Form/Toggle';
import formStyles from '../../components/Form/Form.module.css';
import { Sheet } from '../../components/Sheet/Sheet';
import type { Readiness } from '../../engine/recalibration/types';

interface ReadinessSheetProps {
  open: boolean;
  initial: Readiness | null;
  onClose: () => void;
  onSubmit: (readiness: Readiness) => void;
}

type Scale = '1' | '2' | '3' | '4' | '5';
const SCALE: { value: Scale; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
];
const JOINT_OPTIONS = JOINTS.map((joint) => ({
  value: joint,
  label: joint.replace('-', ' ').replace(/^\w/, (letter) => letter.toUpperCase()),
}));

/**
 * The fast readiness check-in: energy, soreness, sleep, motivation, joint
 * discomfort, and time pressure. Applying it runs the readiness recalibration,
 * which adjusts sets, effort, picks, or the length instead of cancelling.
 */
export function ReadinessSheet({ open, initial, onClose, onSubmit }: ReadinessSheetProps) {
  const [energy, setEnergy] = useState<Scale>(String(initial?.energy ?? 3) as Scale);
  const [soreness, setSoreness] = useState<Scale>(String(initial?.soreness ?? 2) as Scale);
  const [sleep, setSleep] = useState<Scale>(String(initial?.sleep ?? 3) as Scale);
  const [motivation, setMotivation] = useState<Scale>(String(initial?.motivation ?? 3) as Scale);
  const [joints, setJoints] = useState<Joint[]>(initial?.jointDiscomfort ?? []);
  const [timePressure, setTimePressure] = useState(initial?.timePressure ?? false);

  const scale = (label: string, hint: string, value: Scale, onChange: (value: Scale) => void) => (
    <div>
      <p className={formStyles.label}>
        {label} <span style={{ color: 'var(--color-text-subtle)', fontWeight: 500 }}>{hint}</span>
      </p>
      <ChoiceGroup label={label} value={value} options={SCALE} onChange={onChange} compact />
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
            })
          }
        >
          Apply to today’s workout
        </Button>
      }
    >
      {scale('Energy', '1 flat · 5 charged', energy, setEnergy)}
      {scale('Soreness', '1 none · 5 wrecked', soreness, setSoreness)}
      {scale('Sleep', '1 poor · 5 great', sleep, setSleep)}
      {scale('Motivation', '1 low · 5 high', motivation, setMotivation)}
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
