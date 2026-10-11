import { useState } from 'react';
import { Button } from '../../../components/Button/Button';
import { Field } from '../../../components/Form/Field';
import { NumberField } from '../../../components/Form/NumberField';
import formStyles from '../../../components/Form/Form.module.css';
import { useAppState } from '../../../core/state/useAppStore';
import { localDayKey } from '../../../core/time/localDate';
import { nowIso } from '../../../core/time/clock';
import type { UserProfile } from '../../../core/validation/profile';
import { PUSH_LIFT, pushableLifts, type PushLift } from '../../../engine/planning/pushLift';
import { PUSH_PACE, paceReadings } from '../../../engine/planning/pushPace';
import { resolveStyle } from '../../../engine/planning/styleAdvice';
import { convertWeight } from '../../../engine/progression/maxes';
import { updateProfile } from '../draft';
import type { EditorProps } from './EditorProps';
import styles from './editors.module.css';

/** The push as the lifter sees it: in their units, the date as a calendar day. */
function shownTarget(push: PushLift | undefined, units: UserProfile['units']): number | undefined {
  if (!push) return undefined;
  return Math.round(convertWeight(push.target, push.units, units) * 10) / 10;
}

/** A calendar day from a date field, kept as that day's local noon. */
function dayToIso(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const at = new Date(`${day}T12:00:00`);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

/**
 * A lift to push (Maintenance 27, the owner's item 44): one main lift and a target max, with an
 * optional date. The push starts when a lift and a target are both set, and keeps its start while
 * the target or the date changes, so its pace runs on; a new lift starts afresh.
 */
export function PushLiftEditor({ draft, onChange }: EditorProps) {
  const { history } = useAppState();
  const { profile } = draft;
  const push = profile.pushLift;
  const units = profile.units;
  // A lift picked with no target yet: kept here until a target makes it a push. The push before
  // it stands meanwhile.
  const [picked, setPicked] = useState<string | null>(null);
  // The target as typed, while the field is being typed in: an emptied field is not a stop.
  const [typed, setTyped] = useState<number | undefined | null>(null);
  const liftId = picked ?? push?.exerciseId ?? '';
  const lift = pushableLifts().find((candidate) => candidate.id === liftId);
  const reading = lift ? paceReadings(history, lift.id, '1970-01-01T00:00:00.000Z').at(-1) : null;
  const style = resolveStyle(profile);

  const save = (next: PushLift | undefined) =>
    onChange(
      updateProfile(draft, (current) => {
        const copy = { ...current };
        if (next) copy.pushLift = next;
        else delete copy.pushLift;
        return copy;
      }),
    );

  const choose = (exerciseId: string) => {
    if (exerciseId === '') {
      setPicked(null);
      save(undefined);
      return;
    }
    if (exerciseId === push?.exerciseId) {
      setPicked(null);
      return;
    }
    // Another lift: a new push, once its target is set.
    setPicked(exerciseId);
  };

  const setTarget = (target: number | undefined) => {
    setTyped(target);
    if (!lift || target === undefined || !(target > 0) || target > 5000) return;
    const same = push?.exerciseId === lift.id;
    save({
      exerciseId: lift.id,
      target,
      units,
      ...(same && push?.by ? { by: push.by } : {}),
      since: same && push ? push.since : nowIso(),
    });
    setPicked(null);
  };

  const setBy = (day: string) => {
    if (!push) return;
    const by = dayToIso(day);
    const next: PushLift = { ...push };
    if (by) next.by = by;
    else delete next.by;
    save(next);
  };

  return (
    <div className={styles.stack} data-testid="push-lift-editor">
      <Field
        label="Lift"
        hint={`One main lift at a time. It gets one more session a week where your schedule has room, never more than ${PUSH_LIFT.MAX_EXPOSURES} a week (Pelland et al. 2026), and goes first in every session it is in (Nunes et al. 2021). The other work for its muscles holds.`}
        htmlFor="push-lift"
      >
        <select
          id="push-lift"
          className={formStyles.input}
          value={liftId}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="">None</option>
          {pushableLifts().map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </Field>
      {lift ? (
        <>
          <Field
            label="Target max"
            hint={
              reading
                ? `Your last session of it reads about ${Math.round(reading.e1rm)} ${units}.`
                : 'No reading of it yet: Progress shows one after its first session.'
            }
            htmlFor="push-target"
          >
            <div onBlur={() => setTyped(null)}>
              <NumberField
                id="push-target"
                value={
                  typed !== null
                    ? typed
                    : push?.exerciseId === lift.id
                      ? shownTarget(push, units)
                      : undefined
                }
                unit={units}
                min={1}
                max={5000}
                step={units === 'kg' ? 2.5 : 5}
                placeholder="Not set"
                onChange={setTarget}
              />
            </div>
          </Field>
          {push?.exerciseId === lift.id ? (
            <Field
              label="By (optional)"
              hint="A date to aim for: Progress says whether your pace gets there."
              htmlFor="push-by"
            >
              <input
                id="push-by"
                className={formStyles.input}
                type="date"
                value={push.by ? localDayKey(push.by) : ''}
                onChange={(event) => setBy(event.target.value)}
              />
            </Field>
          ) : (
            <p className={styles.summary} data-testid="push-needs-target">
              Set a target to start pushing {lift.name}.
              {push
                ? ` Until then you keep pushing ${pushableLifts().find((one) => one.id === push.exerciseId)?.name ?? 'the lift before'}.`
                : ''}
            </p>
          )}
          {style === 'high-rep' ? (
            <p className={styles.summary} data-testid="push-light-note">
              Light weights builds less max strength than heavier sets (Schoenfeld et al. 2017;
              Lopez et al. 2021): the pace may be slow, and it reads only sets of{' '}
              {PUSH_PACE.MAX_READ_REPS} reps or fewer.
            </p>
          ) : null}
          {style === 'lean-down' ? (
            <p className={styles.summary}>
              Lean-down: the extra session moves sets from the lift&rsquo;s other days and adds
              none.
            </p>
          ) : null}
          {(profile.age ?? 0) >= PUSH_LIFT.OLDER_AGE ? (
            <p className={styles.summary}>
              From age {PUSH_LIFT.OLDER_AGE}, at most {PUSH_LIFT.MAX_EXPOSURES_OLDER} sessions of it
              a week: more adds little (Kneffel et al. 2021).
            </p>
          ) : null}
          {push ? (
            <div className={styles.inline}>
              <Button variant="secondary" onClick={() => choose('')} data-testid="push-stop">
                Stop pushing
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
