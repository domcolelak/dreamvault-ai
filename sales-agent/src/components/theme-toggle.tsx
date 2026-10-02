'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'sales-agent-theme';

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setTheme(stored);
        apply(stored);
      }
    } catch {
      // Private mode or blocked storage: the system preference still applies.
    }
  }, []);

  const change = (next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth an error.
    }
  };

  return (
    <label className="flex items-center gap-2 text-xs text-fgMuted">
      <span className="sr-only">Colour theme</span>
      <select
        value={theme}
        onChange={(event) => change(event.target.value as Theme)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg"
      >
        <option value="system">System theme</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
