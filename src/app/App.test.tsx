import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

function setHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

describe('App shell', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('renders the brand, current phase, and a build marker', () => {
    render(<App />);
    expect(screen.getByText('Workout Conductor')).toBeInTheDocument();
    expect(screen.getByText('Adaptive Strength + Hypertrophy')).toBeInTheDocument();
    expect(screen.getByTestId('phase-chip')).toHaveTextContent('Phase 0');
    expect(screen.getByTestId('build-marker')).toHaveTextContent(/^Build \S+ · .+ · Phase 0$/);
  });

  it('shows the five primary destinations in the bottom navigation', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Today',
      'Workout',
      'Progress',
      'Plan',
      'Settings',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#/today',
      '#/workout',
      '#/progress',
      '#/plan',
      '#/settings',
    ]);
  });

  it('opens Today by default and marks it current', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Plan' })).not.toHaveAttribute('aria-current');
  });

  it('switches screens when the hash changes', () => {
    render(<App />);
    setHash('#/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    setHash('#/plan');
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Settings' })).not.toBeInTheDocument();
  });

  it('falls back to Today for an unknown deep link', () => {
    window.location.hash = '#/nowhere';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  it('keeps Start Workout disabled until a workout exists', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Start Workout' })).toBeDisabled();
  });
});
