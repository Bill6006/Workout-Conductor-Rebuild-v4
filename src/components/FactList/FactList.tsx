import { Fragment, type ReactNode } from 'react';
import styles from './FactList.module.css';

export interface Fact {
  label: string;
  value: ReactNode;
}

interface FactListProps {
  items: readonly Fact[];
}

/** Compact label/value grid for build, diagnostics, and summary facts. */
export function FactList({ items }: FactListProps) {
  return (
    <dl className={styles.facts}>
      {items.map((fact) => (
        <Fragment key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
