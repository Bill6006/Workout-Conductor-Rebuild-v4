import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  eyebrow?: string;
  title?: string;
  tone?: 'default' | 'accent';
  children?: ReactNode;
}

/** Large rounded surface used for every content block in the app. */
export function Card({ eyebrow, title, tone = 'default', children }: CardProps) {
  const className = tone === 'accent' ? `${styles.card} ${styles.accent}` : styles.card;

  return (
    <section className={className}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      {children}
    </section>
  );
}
