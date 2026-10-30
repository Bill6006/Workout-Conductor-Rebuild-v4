import { useMemo, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { useToast } from '../../components/Toast/useToast';
import { useAppSelector, useAppStore } from '../../core/state/useAppStore';
import { formatDateTime, useNow } from '../../core/time/clock';
import { learnedSections, type LearnedSection } from '../../engine/learned/learned';
import styles from './Settings.module.css';

/**
 * What the app has learned (Maintenance 27, the owner's item 47): each learned value, what it is
 * read from, and a reset that asks once more. A reset deletes nothing logged; the value is learned
 * again from what is logged next.
 */
export function LearnedValues() {
  const store = useAppStore();
  const toast = useToast();
  const history = useAppSelector((state) => state.history);
  const readHistory = useAppSelector((state) => state.readHistory);
  const profile = useAppSelector((state) => state.profile);
  const resets = useAppSelector((state) => state.learnedResets);
  const declines = useAppSelector((state) => state.coachDeclines);
  const nowEpoch = useNow();
  const [confirming, setConfirming] = useState<LearnedSection['key'] | null>(null);
  const sections = useMemo(
    () =>
      profile
        ? learnedSections({
            history,
            readHistory,
            profile,
            // The minute clock; before it ticks, the profile's own time, as Progress does.
            now: nowEpoch ? new Date(nowEpoch).toISOString() : profile.updatedAt,
            resets,
            declines,
          })
        : [],
    [history, readHistory, profile, nowEpoch, resets, declines],
  );

  const reset = async (section: LearnedSection) => {
    setConfirming(null);
    try {
      if (section.key === 'declines') await store.clearDeclines();
      else await store.resetLearned(section.key);
      toast.show(`${section.title}: reset.`, 'success');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'The reset did not save.', 'error');
    }
  };

  return (
    <div className={styles.learned} data-testid="learned-values">
      <p className={styles.body}>
        Each thing the app has learned from your log, what it is read from, and a reset. A reset
        deletes nothing you logged: the value is learned again from what you log next.
      </p>
      <ul className={styles.learnedList}>
        {sections.map((section) => (
          <li
            key={section.key}
            className={styles.learnedItem}
            data-testid={`learned-${section.key}`}
          >
            <p className={styles.learnedTitle}>{section.title}</p>
            <p className={styles.learnedStatus} data-testid="learned-status">
              {section.status}
            </p>
            {section.items.length > 0 ? (
              <ul className={styles.learnedLines}>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <p className={styles.learnedEvidence}>{section.evidence}</p>
            {section.resetAt ? (
              <p className={styles.learnedEvidence}>
                Last reset {formatDateTime(section.resetAt)}.
              </p>
            ) : null}
            {section.reset ? (
              <div className={styles.learnedActions}>
                {confirming === section.key ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => void reset(section)}
                      data-testid={`learned-confirm-${section.key}`}
                    >
                      Confirm: {section.reset.toLowerCase()}
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setConfirming(section.key)}
                    data-testid={`learned-reset-${section.key}`}
                  >
                    {section.reset}
                  </Button>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
