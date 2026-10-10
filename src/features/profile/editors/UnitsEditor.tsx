import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/Button/Button';
import { ChoiceGroup } from '../../../components/Form/ChoiceGroup';
import { Field } from '../../../components/Form/Field';
import { NumberField } from '../../../components/Form/NumberField';
import { useToast } from '../../../components/Toast/useToast';
import { BODYWEIGHT_MAX, type UnitSystem } from '../../../core/validation/profile';
import { convertWeight } from '../../../engine/progression/maxes';
import { bodyweightSlip } from '../../../engine/progression/slips';
import { DEBOUNCE_MS } from '../useProfileEditor';
import { updateProfile, type ProfileDraft } from '../draft';
import { SEX_OPTIONS, UNIT_OPTIONS } from '../labels';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

/** How long a typed bodyweight stands before a question about it shows: Settings' own save pause. */
const SETTLE_MS = DEBOUNCE_MS;

function withBodyweight(draft: ProfileDraft, bodyweight: number | undefined): ProfileDraft {
  return updateProfile(draft, (current) => {
    const next = { ...current };
    if (bodyweight === undefined) {
      delete next.bodyweight;
    } else {
      next.bodyweight = bodyweight;
    }
    return next;
  });
}

interface Confirmed {
  value: number;
  units: UnitSystem;
}

interface UnitsEditorProps extends EditorProps {
  /** Settings saves the draft as the typing pauses; setup saves it only at Finish. */
  autosaves?: boolean;
}

export function UnitsEditor({ draft, onChange, autosaves = false }: UnitsEditorProps) {
  const { profile } = draft;
  const toast = useToast();
  // A bodyweight that looks like a slip (Maintenance 26, item 40) is held back from the draft, and
  // so from the save, until it is kept or changed; the question shows once the typing pauses.
  // It is judged against the bodyweight last confirmed: the draft's as the editor opened, then one
  // typed and left, or kept. Nothing saved part-way (a field emptied while typing) moves it, and
  // it is read in the units shown, converted (the review of item 40 and its re-check: a held
  // number could be left unsaved with no question, 82 kg was held to 180 lb, and after a switch
  // the quarter's rule was lost). While it asks, the draft keeps the bodyweight it had as the
  // typing began.
  const [confirmed, setConfirmed] = useState<Confirmed | null>(() =>
    profile.bodyweight !== undefined ? { value: profile.bodyweight, units: profile.units } : null,
  );
  const [before, setBefore] = useState<number | undefined>(profile.bodyweight);
  const [held, setHeld] = useState<number | null>(null);
  const [settled, setSettled] = useState<number | null>(null);
  const typedHere = useRef(false);
  useEffect(() => {
    if (held === null) return undefined;
    const timer = window.setTimeout(() => setSettled(held), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [held]);
  // A plausible number the typing pauses on is the one a later question goes back to: Settings
  // saves it at that pause (the third pass of item 40: 182 saved, then 1820 asked about, put 180
  // back).
  const beforeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(beforeTimer.current), []);
  // Left with a question open (Settings closed, or setup finished): said, with the bodyweight that
  // stands, never dropped silently.
  const leftHeld = useRef<string | null>(null);
  useEffect(() => {
    const stands =
      profile.bodyweight !== undefined
        ? `Bodyweight stays ${profile.bodyweight} ${profile.units}`
        : 'Bodyweight not set';
    leftHeld.current = held !== null ? `${stands}: ${held} ${profile.units} was not kept.` : null;
  }, [held, profile.bodyweight, profile.units]);
  useEffect(
    () => () => {
      if (leftHeld.current !== null) toast.show(leftHeld.current, 'info');
    },
    [toast],
  );
  const slipOf = (value: number, units: UnitSystem) =>
    bodyweightSlip(
      value,
      confirmed ? convertWeight(confirmed.value, confirmed.units, units) : undefined,
      units,
      !autosaves,
      confirmed ?? undefined,
    );
  const asking = held !== null && settled === held ? slipOf(held, profile.units) : null;
  // More than a profile keeps cannot be kept: only changed.
  const keepable = held !== null && held <= BODYWEIGHT_MAX;

  return (
    <div className={styles.stack}>
      <Field label="Unit system">
        <ChoiceGroup
          label="Unit system"
          value={profile.units}
          options={UNIT_OPTIONS}
          layout="grid-2"
          compact
          onChange={(units) => {
            const next = updateProfile(draft, (current) => ({ ...current, units }));
            // A number held for a question is judged again in the new units: one that no longer
            // looks like a slip goes in with them (the review of item 40: 55 typed in lb, then kg).
            if (held !== null && !slipOf(held, units)) {
              setHeld(null);
              // Let in, it is the bodyweight that stands: the next change is judged against it, as
              // after Keep (the eighth pass of item 40: an older one was named).
              setConfirmed({ value: held, units });
              setBefore(held);
              onChange(withBodyweight(next, held));
              return;
            }
            onChange(next);
          }}
        />
      </Field>
      <Field
        label="Bodyweight (optional)"
        hint="Sets the starting weight for lifts you have not logged yet; nothing else reads it."
        htmlFor="bodyweight"
      >
        <div
          onFocus={() => {
            // The bodyweight the draft had as the typing began: kept while a question is open.
            if (held === null) setBefore(profile.bodyweight);
          }}
          onBlur={() => {
            // Typed and left with no question open: the bodyweight now confirmed.
            if (typedHere.current && held === null && profile.bodyweight !== undefined) {
              setConfirmed({ value: profile.bodyweight, units: profile.units });
            }
            typedHere.current = false;
          }}
        >
          <NumberField
            id="bodyweight"
            value={held ?? profile.bodyweight}
            unit={profile.units}
            min={1}
            max={BODYWEIGHT_MAX}
            step={0.5}
            placeholder="Not set"
            onChange={(bodyweight) => {
              typedHere.current = true;
              window.clearTimeout(beforeTimer.current);
              if (bodyweight !== undefined && slipOf(bodyweight, profile.units)) {
                setHeld(bodyweight);
                // It settles again before it asks: a number asked about before shows its question
                // only once the typing pauses (the re-check).
                setSettled(null);
                // Nothing typed on the way (165 on the way to 1650) is saved while it is asked
                // about: the draft goes back to what it had as the typing began.
                if (profile.bodyweight !== before) onChange(withBodyweight(draft, before));
                return;
              }
              setHeld(null);
              onChange(withBodyweight(draft, bodyweight));
              // A number the typing pauses on is the one a question goes back to, and the one the
              // next change is judged against: Settings saves it at that pause, and setup's question
              // calls it the one entered (the fourth to seventh passes of item 40: setup named an
              // older number while a newer one stood). An emptied field is no bodyweight to go back
              // to.
              if (bodyweight !== undefined) {
                const units = profile.units;
                beforeTimer.current = window.setTimeout(() => {
                  setBefore(bodyweight);
                  setConfirmed({ value: bodyweight, units });
                }, SETTLE_MS);
              }
            }}
          />
        </div>
        {asking && held !== null ? (
          <div className={styles.slip} data-testid="slip-question">
            <p className={styles.slipText} id="bodyweight-question" role="alert">
              {asking.text}
              {keepable ? '' : ` A bodyweight can be at most ${BODYWEIGHT_MAX} ${profile.units}.`}
            </p>
            <div className={styles.inline}>
              {keepable ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const kept = held;
                    setHeld(null);
                    setConfirmed({ value: kept, units: profile.units });
                    onChange(withBodyweight(draft, kept));
                  }}
                  aria-describedby="bodyweight-question"
                  data-testid="slip-keep"
                >
                  Keep {held} {profile.units}
                </Button>
              ) : null}
              <Button
                onClick={() => document.getElementById('bodyweight')?.focus()}
                aria-describedby="bodyweight-question"
                data-testid="slip-change"
              >
                Change it
              </Button>
            </div>
          </div>
        ) : null}
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
