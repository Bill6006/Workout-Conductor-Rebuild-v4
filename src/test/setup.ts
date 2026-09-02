import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, vi } from 'vitest';

// The service-worker registration hook is a build-time virtual module; tests
// never register a worker. Individual tests may override this mock.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// jsdom does not implement scrolling; the shell scrolls to top on route change.
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });

// Fresh IndexedDB and localStorage for every test so state never leaks.
beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
    writable: true,
  });
  window.localStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
});
