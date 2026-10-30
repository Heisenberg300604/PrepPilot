import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromApiTheme, ThemeProvider, toApiTheme, useTheme } from './theme';

function mockMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: dark,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', () => mq);
  return {
    set(next: boolean) {
      mq.matches = next;
      listeners.forEach((l) => l());
    },
  };
}

function Probe() {
  const { pref, resolved, setPref } = useTheme();
  return (
    <div>
      <span data-testid="state">{`${pref}/${resolved}`}</span>
      <button onClick={() => setPref('dark')}>dark</button>
      <button onClick={() => setPref('light')}>light</button>
      <button onClick={() => setPref('system')}>system</button>
    </div>
  );
}
const renderProbe = () => render(<ThemeProvider><Probe /></ThemeProvider>);

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ThemeProvider', () => {
  it('defaults to system and resolves it from matchMedia', () => {
    mockMatchMedia(true);
    renderProbe();
    expect(screen.getByTestId('state')).toHaveTextContent('system/dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies and persists an explicit choice', () => {
    mockMatchMedia(false);
    renderProbe();
    act(() => screen.getByText('dark').click());
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('preppilot-theme')).toBe('dark');
    act(() => screen.getByText('light').click());
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('preppilot-theme')).toBe('light');
  });

  it('restores the cached preference on load', () => {
    mockMatchMedia(false);
    localStorage.setItem('preppilot-theme', 'dark');
    renderProbe();
    expect(screen.getByTestId('state')).toHaveTextContent('dark/dark');
  });

  it('ignores garbage in storage', () => {
    mockMatchMedia(false);
    localStorage.setItem('preppilot-theme', 'neon');
    renderProbe();
    expect(screen.getByTestId('state')).toHaveTextContent('system/light');
  });

  it('follows OS changes only while on system', () => {
    const mm = mockMatchMedia(false);
    renderProbe();
    act(() => mm.set(true));
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => screen.getByText('light').click());
    act(() => mm.set(false));
    act(() => mm.set(true));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('still works when localStorage throws', () => {
    mockMatchMedia(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderProbe();
    act(() => screen.getByText('dark').click());
    expect(document.documentElement.dataset.theme).toBe('dark');
    vi.restoreAllMocks();
  });

  it('throws a clear error outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});

describe('api theme mapping', () => {
  it('converts between API and UI values', () => {
    expect(toApiTheme('dark')).toBe('DARK');
    expect(toApiTheme('system')).toBe('SYSTEM');
    expect(fromApiTheme('LIGHT')).toBe('light');
  });
});
