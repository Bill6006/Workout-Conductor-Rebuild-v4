import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { changeOpenSheets } from './openSheets';
import styles from './Sheet.module.css';

// The last element focused (Maintenance 25): an opener disabled while it works has lost focus by
// the time its sheet opens, and focus goes back to it when the sheet closes.
let lastFocused: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement) lastFocused = event.target;
  });
}

// The page's scroll as it was before the first sheet opened (the count is in openSheets.ts): one
// sheet closing while another stays open leaves the page locked, and the last one closing gives
// it back.
let overflowBefore = '';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Bottom sheet for editing and confirmations. Closes on backdrop tap or Escape. It sits on the page
 * itself, not inside what opened it (Maintenance 25): a Settings row closed behind an open sheet
 * keeps its editor in the page, hidden, and a sheet inside it would vanish with it while still
 * holding the page's scroll.
 */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Runs only when the sheet opens or closes, so re-renders never re-focus or re-lock.
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : lastFocused;
    const before = document.body.style.overflow;
    if (changeOpenSheets(1) === 1) overflowBefore = before;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      if (changeOpenSheets(-1) === 0) document.body.style.overflow = overflowBefore;
      window.removeEventListener('keydown', onKeyDown);
      // Back to what opened it: the sheet sits at the end of the page, so the next Tab would
      // otherwise start from the top (Maintenance 25). An opener gone, hidden or disabled takes no
      // focus; the browser refuses it.
      opener?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} data-testid="sheet-backdrop">
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
