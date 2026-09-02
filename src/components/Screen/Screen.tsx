import { Card } from '../Card/Card';
import styles from './Screen.module.css';

interface ScreenHeaderProps {
  title: string;
  intro?: string;
}

export function ScreenHeader({ title, intro }: ScreenHeaderProps) {
  return (
    <div className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
    </div>
  );
}

interface PlaceholderCardProps {
  title: string;
  arrivesIn: string;
  items: readonly string[];
}

/** Honest "what will live here" card used while a screen's real feature is unbuilt. */
export function PlaceholderCard({ title, arrivesIn, items }: PlaceholderCardProps) {
  return (
    <Card eyebrow={`Arrives in ${arrivesIn}`} title={title}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}
