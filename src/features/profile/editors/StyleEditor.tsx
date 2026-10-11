import { ChoiceGroup } from '../../../components/Form/ChoiceGroup';
import { Field } from '../../../components/Form/Field';
import { Toggle } from '../../../components/Form/Toggle';
import { styleChoice, withStyleChoice, type UserProfile } from '../../../core/validation/profile';
import { adviseStyle, allowsFailure, resolveStyle } from '../../../engine/planning/styleAdvice';
import { GRADE_LABEL, evidenceLines, styleInfo } from '../../../engine/planning/styles';
import { updateProfile } from '../draft';
import { REST_STYLE_OPTIONS, styleOptions } from '../labels';
import type { EditorProps } from './EditorProps';
import { keyedLines } from '../../../core/screen/keyedLines';
import styles from './editors.module.css';

/** What the chosen style is, why Auto came to it, and the research, folded away until asked for. */
function StyleWhy({ profile }: { profile: UserProfile }) {
  const choice = styleChoice(profile);
  const advice = adviseStyle(profile);
  const auto = choice === 'auto';
  const info = styleInfo(auto ? advice.style : choice);
  return (
    <div className={styles.styleWhy} data-testid="style-why">
      <p className={styles.styleWhyHead}>
        <span data-testid="style-resolved">{auto ? `Auto picked ${info.name}` : info.name}</span>
        <span className={styles.styleGrade} data-grade={info.grade}>
          {GRADE_LABEL[info.grade]}
        </span>
      </p>
      {auto ? (
        keyedLines(advice.reasons).map(({ key, line }) => (
          <p key={key} className={styles.summary}>
            {line}
          </p>
        ))
      ) : (
        <p className={styles.summary}>
          {info.line}.
          {advice.style !== choice ? ` Your goals point to ${styleInfo(advice.style).name}.` : ''}
        </p>
      )}
      {auto && advice.hint ? <p className={styles.summary}>{advice.hint}</p> : null}
      <details className={styles.research} data-testid="style-research">
        <summary className={styles.researchSummary}>The research</summary>
        <ul className={styles.researchList}>
          {keyedLines(evidenceLines(info.id)).map(({ key, line }) => (
            <li key={key}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

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
      <Field
        label="Programming style"
        hint="Auto lets your goals, your experience, and whether you are losing fat pick it."
      >
        <ChoiceGroup
          label="Programming style"
          value={styleChoice(profile)}
          options={styleOptions(profile)}
          layout="stack"
          onChange={(programStyle) =>
            onChange(
              updateProfile(draft, (current) =>
                withStyleChoice(
                  current,
                  programStyle,
                  programStyle === 'auto' ? adviseStyle(current).style : programStyle,
                ),
              ),
            )
          }
        />
        <StyleWhy profile={profile} />
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
            description="At most one a workout, on an isolation move that suits it. Lean-down and Foundation plan none."
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
      <Field
        label="Reserve checks"
        hint="How well you judge the reps you have left, checked now and then (Halperin et al., 2022: most lifters judge about one rep fewer than they have)."
      >
        <div className={styles.toggles}>
          <Toggle
            label="Check how well I judge reps in reserve"
            description={
              allowsFailure(resolveStyle(profile))
                ? 'Now and then the last set of one machine or cable isolation lift goes on to failure: stop where you usually would, judge the reps left, then keep going until you cannot finish a rep with good form. Weekly until five checks, then every four weeks. Leave it off with high blood pressure or a heart condition, or if the lift hurts.'
                : 'Your style takes nothing to failure, so it takes no checks.'
            }
            checked={profile.reserveCheck === true}
            disabled={!allowsFailure(resolveStyle(profile))}
            onChange={(value) =>
              onChange(updateProfile(draft, (current) => ({ ...current, reserveCheck: value })))
            }
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
