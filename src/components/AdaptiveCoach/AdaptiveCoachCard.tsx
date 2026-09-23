import { useState } from 'react';
import type { CoachAction, CoachCard, CoachSignal } from '../../engine/coach/coachConductor';
import type { CoachingPolicy } from '../../engine/coach/experience';
import type { FatigueSignal } from '../../engine/recovery/fatigue';
import styles from './AdaptiveCoachCard.module.css';

interface AdaptiveCoachCardProps {
  card: CoachCard | null;
  fatigue: FatigueSignal;
  policy: CoachingPolicy;
  /** The action tapped, with the signal it belonged to so the offer can be marked as taken. */
  onAction: (action: CoachAction, signal: CoachSignal) => void;
  /**
   * Not now, on every card: an offer is not repeated for a while; a safety card, or a card with
   * nothing to tap, is set aside for this workout.
   */
  onDismiss?: (signal: CoachSignal) => void;
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
export function AdaptiveCoachCard({
  card,
  fatigue,
  policy,
  onAction,
  onDismiss,
}: AdaptiveCoachCardProps) {
  const signal = card?.signal ?? null;
  const action = signal?.action ?? null;
  // A second tap confirms only the action it was asked for: when the card changes, the pending
  // confirm is gone rather than carried to a different change.
  const actionKey =
    signal && action ? `${signal.source}|${signal.exerciseId ?? '*'}|${action.label}` : null;
  const [confirmingFor, setConfirmingFor] = useState<string | null>(null);
  // Once another card has shown, the pending confirm is dropped, so the first card, if it
  // returns, asks for its second tap again rather than applying on one.
  if (confirmingFor !== null && confirmingFor !== actionKey) setConfirmingFor(null);
  const confirming = actionKey !== null && confirmingFor === actionKey;

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
    if (!action || !signal) return;
    if (action.kind === 'recalibrate' && action.major && !confirming) {
      setConfirmingFor(actionKey);
      return;
    }
    setConfirmingFor(null);
    onAction(action, signal);
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
      {/* Every card can be put away, including one with nothing to tap (Maintenance 21). */}
      {action || (signal && onDismiss) ? (
        <div className={styles.actions}>
          {action ? (
            <button
              type="button"
              className={styles.action}
              onClick={act}
              data-testid="coach-action"
              aria-live="polite"
            >
              {confirming ? `Confirm: ${action.label}` : action.label}
            </button>
          ) : null}
          {action && confirming ? (
            <button type="button" className={styles.cancel} onClick={() => setConfirmingFor(null)}>
              Not now
            </button>
          ) : onDismiss && signal ? (
            <button
              type="button"
              className={styles.cancel}
              onClick={() => onDismiss(signal)}
              data-testid="coach-dismiss"
            >
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
