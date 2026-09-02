import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement scrolling; the shell scrolls to top on route change.
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });

afterEach(() => {
  cleanup();
});
