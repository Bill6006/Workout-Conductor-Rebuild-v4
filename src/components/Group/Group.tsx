import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './Group.module.css';

/**
 * Grouped rows (Maintenance 25, the owner's item 5): a small heading over one surface whose rows
 * are divided by hairlines, in place of a stack of separate cards. A row shows its current value
 * and opens in place to change it, so nothing is hidden and nothing takes a screen until asked.
 */

interface GroupProps {
  title: string;
  children: ReactNode;
  testId?: string;
}

export function Group({ title, children, testId }: GroupProps) {
  const id = useId();
  return (
    <section className={styles.group} aria-labelledby={id} data-testid={testId}>
      <h2 className={styles.heading} id={id}>
        {title}
      </h2>
      <div className={styles.surface}>{children}</div>
    </section>
  );
}

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      className={styles.chevron}
      data-open={open ? 'true' : undefined}
      viewBox="0 0 20 20"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <path
        d="M7.5 4.5 13 10l-5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface DisclosureRowProps {
  /** Stable name: the row's test id is `row-<name>`, and `#/<tab>/<name>` opens it. */
  name: string;
  title: string;
  /** The current value, in a line or two. */
  summary?: ReactNode;
  /** Open from the start, where it is: a row that needs a look. The lifter can still close it. */
  initiallyOpen?: boolean;
  /**
   * The row a link names (`#/<tab>/<name>`): it opens and comes into view, each time the link is
   * followed.
   */
  linked?: boolean;
  children: ReactNode;
}

/**
 * A row that shows its current value and opens in place to change it. Once opened, its editor
 * stays in the page while closed, so what was typed and a save under way are kept.
 */
export function DisclosureRow({
  name,
  title,
  summary,
  initiallyOpen = false,
  linked = false,
  children,
}: DisclosureRowProps) {
  const [open, setOpen] = useState(initiallyOpen || linked);
  const [opened, setOpened] = useState(initiallyOpen || linked);
  // Named by a link while the page is up: it opens, as on arrival.
  const [wasLinked, setWasLinked] = useState(linked);
  if (linked !== wasLinked) {
    setWasLinked(linked);
    if (linked) {
      setOpen(true);
      setOpened(true);
    }
  }
  const panelId = useId();
  const headerId = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  // Followed from a link, the row comes into view rather than the top of the page; a row the
  // lifter opens, or one opened because it needs a look, stays where it is.
  useEffect(() => {
    if (linked) rowRef.current?.scrollIntoView?.({ block: 'start' });
  }, [linked]);
  return (
    <div ref={rowRef} className={styles.row} data-open={open ? 'true' : undefined}>
      <button
        type="button"
        id={headerId}
        className={styles.rowButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
          setOpened(true);
        }}
        data-testid={`row-${name}`}
      >
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{title}</span>
          {summary ? <span className={styles.rowSummary}>{summary}</span> : null}
        </span>
        <Chevron open={open} />
      </button>
      {opened ? (
        <div
          id={panelId}
          className={styles.panel}
          role="region"
          aria-labelledby={headerId}
          hidden={!open}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface LinkRowProps {
  title: string;
  summary?: ReactNode;
  href: string;
  testId?: string;
}

/** A row that takes the lifter to where a thing lives, saying what it holds now. */
export function LinkRow({ title, summary, href, testId }: LinkRowProps) {
  return (
    <div className={styles.row}>
      <a className={styles.rowButton} href={href} data-testid={testId}>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{title}</span>
          {summary ? <span className={styles.rowSummary}>{summary}</span> : null}
        </span>
        <Chevron />
      </a>
    </div>
  );
}

/** A row whose controls sit in it, always shown: quick switches, a status. */
export function PlainRow({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className={`${styles.row} ${styles.plain}`} data-testid={testId}>
      {children}
    </div>
  );
}
