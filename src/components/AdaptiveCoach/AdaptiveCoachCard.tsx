import { useState } from 'react';
import type { CoachAction, CoachCard } from '../../engine/coach/coachConductor';
import type { CoachingPolicy } from '../../engine/coach/experience';
import type { FatigueSignal } from '../../engine/recovery/fatigue';
import styles from './AdaptiveCoachCard.module.css';

interface AdaptiveCoachCardProps {
  card: CoachCard | null;
  fatigue: FatigueSignal;
  policy: CoachingPolicy;
  onAction: (action: CoachAction) => void;
}

const DOMAIN_LABELS: Record<string, string> = {
  safety: 'Safety',
  save: 'Save',
  recovery: 'Recovery',
  plateau: 'Plateau',
  progression: 'Progression',
  fit: 'Exercise fit',
  coverage: 'Coverage',
  rest: 'Rest',
  tips: 'Tip',
};

/**
 * The one gold Adaptive Coach surface: a headline, concise Why evidence, and
 * at most one action. Major changes ask for a second tap. Nothing here happens
 * on its own.
 */
export function AdaptiveCoachCard({ card, fatigue, policy, onAction }: AdaptiveCoachCardProps) {
  const [confirming, setConfirming] = useState(false);
  const signal = card?.signal ?? null;
  const action = signal?.action ?? null;

  // Past beginner level a quiet plan gets one quiet line, not a card full of reasons.
  if (!signal && !policy.showClearCard) {
    return (
      <section
        className={`${styles.card} ${styles.quiet}`}
        aria-label="Adaptive Coach"
        data-testid="coach-card"
        data-domain="clear"
        data-tone="brief"
      >
        <span className={styles.eyebrow}>
          <span className={styles.dot} aria-hidden="true" />
          Adaptive Coach
        </span>
        <p className={styles.quietLine} data-testid="coach-headline">
          No signal outranks the plan today · fatigue {fatigue.level}
        </p>
      </section>
    );
  }

  const act = () => {
    if (!action) return;
    if (action.kind === 'recalibrate' && action.major && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onAction(action);
  };

  return (
    <section
      className={styles.card}
      aria-label="Adaptive Coach"
      data-testid="coach-card"
      data-domain={signal?.domain ?? 'clear'}
      data-tone={policy.tone}
    >
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <span className={styles.dot} aria-hidden="true" />
          Adaptive Coach
        </span>
        <span className={styles.domain}>
          {signal ? DOMAIN_LABELS[signal.domain] : 'All clear'}
          {signal ? ` · ${signal.confidence} confidence` : ''}
        </span>
      </header>
      <h3 className={styles.headline} data-testid="coach-headline">
        {signal ? signal.headline : 'Follow today’s plan'}
      </h3>
      <ul className={styles.why} aria-label="Why">
        {(signal ? signal.why : fatigue.evidence).slice(0, policy.whyLines).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {action ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={act}
            data-testid="coach-action"
            aria-live="polite"
          >
            {confirming ? `Confirm: ${action.label}` : action.label}
          </button>
          {confirming ? (
            <button type="button" className={styles.cancel} onClick={() => setConfirming(false)}>
              Not now
            </button>
          ) : null}
        </div>
      ) : null}
      {policy.tone === 'explain' ? (
        <p className={styles.footer}>
          {card
            ? `Checked ${card.considered} ${card.considered === 1 ? 'signal' : 'signals'} across ${card.domains.map((domain) => DOMAIN_LABELS[domain]?.toLowerCase() ?? domain).join(', ')}. Nothing is applied without your tap.`
            : `Fatigue ${fatigue.level}. No signal outranks the plan today.`}
        </p>
      ) : null}
    </section>
  );
}
