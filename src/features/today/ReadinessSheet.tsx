import { Fragment, useState } from 'react';
import { JOINTS, type Joint } from '../../catalog/exercises/exerciseSchema';
import { Button } from '../../components/Button/Button';
import { ChipSelect } from '../../components/Form/ChipSelect';
import { ChoiceGroup } from '../../components/Form/ChoiceGroup';
import { Toggle } from '../../components/Form/Toggle';
import formStyles from '../../components/Form/Form.module.css';
import { Sheet } from '../../components/Sheet/Sheet';
import type { Illness } from '../../engine/readiness/checkIn';
import type { Filled, LifeMirrorPrefill } from '../../engine/readiness/lifeMirror';
import type { Readiness } from '../../engine/recalibration/types';

interface ReadinessSheetProps {
  open: boolean;
  initial: Readiness | null;
  /**
   * Today's Life Mirror check-in (item 48), with the lifter's switch on: it fills in what today's
   * check-in has not been told, each value labelled, and a tap changes it.
   */
  lifeMirror?: LifeMirrorPrefill | null;
  /**
   * The lifter's switch (item 48). On, Life Mirror's stress and mood are shown wherever they came,
   * labelled and changeable; off, a check-in told here carries neither (the review of item 48: they
   * counted in the check-in unseen).
   */
  lifeMirrorOn?: boolean;
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
/** The items Life Mirror can fill in that this sheet asks (item 48). */
const LIFE_FIELDS = ['energy', 'sleep', 'motivation'] as const;
type LifeField = (typeof LIFE_FIELDS)[number];
/**
 * Life Mirror's own items, never asked here (item 48): shown only where it gave them, in its own
 * words, so a value reads as it did there.
 */
const SHARED_FIELDS = ['stress', 'mood'] as const;
type SharedField = (typeof SHARED_FIELDS)[number];
const SHARED: Record<SharedField, { label: string; words: readonly string[] }> = {
  stress: { label: 'Stress', words: ['Loose', 'Light', 'Middling', 'Wound tight', 'Crushing'] },
  mood: { label: 'Mood', words: ['Heavy', 'Down', 'Flat', 'Warm', 'Bright'] },
};
/** A check-in's time on this device, as Today says times. */
const clockOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
 * picks and the length, as before. With the Life Mirror switch on (item 48), its stress and mood
 * where it gave them, which count against the lifter's own like the rest.
 */
export function ReadinessSheet({
  open,
  initial,
  lifeMirror = null,
  lifeMirrorOn = false,
  onClose,
  onSubmit,
}: ReadinessSheetProps) {
  // Each value: the lifter's own tap, else today's told check-in, else Life Mirror's (item 48),
  // else the scale's middle. A value Life Mirror gave keeps its label until a tap, any tap, makes it
  // the lifter's own (the review of item 48: one tapped back was told as Life Mirror's).
  const [own, setOwn] = useState<Partial<Record<Filled, Scale>>>({});
  /** Today's told check-in's value, else Life Mirror's; none where neither gave one. */
  const given = (field: Filled): { value: Scale; from?: string } | null => {
    if (initial) {
      const value = initial[field];
      return value === undefined
        ? null
        : { value: String(value) as Scale, from: initial.fromLifeMirror?.[field] };
    }
    const filled = lifeMirror?.[field];
    return filled ? { value: String(filled.value) as Scale, from: filled.at } : null;
  };
  const valueOf = (field: LifeField): Scale => own[field] ?? given(field)?.value ?? '3';
  const fromOf = (field: Filled): string | undefined =>
    own[field] === undefined ? given(field)?.from : undefined;
  const setField = (field: Filled) => (value: Scale) =>
    setOwn((before) => ({ ...before, [field]: value }));
  // Life Mirror's stress and mood, with the switch on and where they came: shown and told alike.
  const shared = SHARED_FIELDS.flatMap((field) => {
    const value = own[field] ?? given(field)?.value;
    return lifeMirrorOn && value !== undefined ? [{ field, value }] : [];
  });
  const [soreness, setSoreness] = useState<Scale>(String(initial?.soreness ?? 2) as Scale);
  const [joints, setJoints] = useState<Joint[]>(initial?.jointDiscomfort ?? []);
  const [timePressure, setTimePressure] = useState(initial?.timePressure ?? false);
  const [unwell, setUnwell] = useState<Unwell>(initial?.illness ?? 'no');

  const scale = (
    label: string,
    words: readonly string[],
    value: Scale,
    onChange: (value: Scale) => void,
    from?: { field: Filled; at: string | undefined },
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
      {from?.at ? (
        <p className={formStyles.hint} data-testid={`from-life-mirror-${from.field}`}>
          From Life Mirror, {clockOf(from.at)}
        </p>
      ) : null}
    </div>
  );

  /** The check-in as told: Life Mirror's stress and mood as shown, and where each value came from. */
  const told = (readiness: Readiness): Readiness => {
    const carried: Partial<Record<SharedField, number>> = {};
    const from: Partial<Record<Filled, string>> = {};
    for (const field of LIFE_FIELDS) {
      const at = fromOf(field);
      if (at) from[field] = at;
    }
    for (const { field, value } of shared) {
      carried[field] = Number(value);
      const at = fromOf(field);
      if (at) from[field] = at;
    }
    return {
      ...readiness,
      ...carried,
      ...(Object.keys(from).length > 0 ? { fromLifeMirror: from } : {}),
    };
  };

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
            onSubmit(
              told({
                energy: Number(valueOf('energy')),
                soreness: Number(soreness),
                sleep: Number(valueOf('sleep')),
                motivation: Number(valueOf('motivation')),
                jointDiscomfort: joints,
                timePressure,
                ...(unwell === 'no' ? {} : { illness: unwell }),
              }),
            )
          }
        >
          Apply to today’s workout
        </Button>
      }
    >
      {scale('Energy', WORDS.energy, valueOf('energy'), setField('energy'), {
        field: 'energy',
        at: fromOf('energy'),
      })}
      {scale('Soreness', WORDS.soreness, soreness, setSoreness)}
      {scale('Sleep', WORDS.sleep, valueOf('sleep'), setField('sleep'), {
        field: 'sleep',
        at: fromOf('sleep'),
      })}
      {scale('Motivation', WORDS.motivation, valueOf('motivation'), setField('motivation'), {
        field: 'motivation',
        at: fromOf('motivation'),
      })}
      {shared.map(({ field, value }) => (
        <Fragment key={field}>
          {scale(SHARED[field].label, SHARED[field].words, value, setField(field), {
            field,
            at: fromOf(field),
          })}
        </Fragment>
      ))}
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
