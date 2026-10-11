// what this browser remembers: the language, the theme and a saved tracker
// address. one key in local storage, the inline script in app.html reads the
// same key before the first paint

import { browser } from '$app/environment';

export type Lang = 'en' | 'de';
export type Theme = 'dark' | 'light';

export const LANGS: Lang[] = ['en', 'de'];
export const STORAGE_KEY = 'brainsol-preferences';

interface Stored {
  // only set once someone picks a language, until then the browser decides
  lang?: Lang;
  theme: Theme;
  // a tracker address, sim for the simulation, empty for config.json
  address: string;
}

const THEME_COLORS: Record<Theme, string> = { dark: '#111113', light: '#f4f4f5' };

// the first english or german entry in the browser's list, english otherwise
export function browserLang(languages: readonly string[] | undefined): Lang {
  for (const entry of languages ?? []) {
    const code = String(entry).slice(0, 2).toLowerCase();
    if (code === 'de' || code === 'en') return code;
  }
  return 'en';
}

// only known keys of the right kind, so an old or broken value falls back
export function readStored(text: string | null): Stored {
  const stored: Stored = { theme: 'dark', address: '' };
  if (!text) return stored;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (value && typeof value === 'object') {
      if (value.lang === 'en' || value.lang === 'de') stored.lang = value.lang;
      if (value.theme === 'light') stored.theme = 'light';
      if (typeof value.address === 'string') stored.address = value.address.trim().slice(0, 300);
    }
  } catch {}
  return stored;
}

class Preferences {
  lang = $state<Lang>('en');
  theme = $state<Theme>('dark');
  address = $state('');
  private chosenLang: Lang | undefined;

  constructor() {
    if (!browser) return;
    let text: string | null = null;
    try {
      text = localStorage.getItem(STORAGE_KEY);
    } catch {}
    const stored = readStored(text);
    this.chosenLang = stored.lang;
    this.lang = stored.lang ?? browserLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
    this.theme = stored.theme;
    this.address = stored.address;
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    this.chosenLang = lang;
    if (browser) document.documentElement.lang = lang;
    this.save();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    if (browser) applyTheme(theme);
    this.save();
  }

  toggleTheme(): void {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  setAddress(address: string): void {
    this.address = address.trim();
    this.save();
  }

  private save(): void {
    if (!browser) return;
    const stored: Stored = { theme: this.theme, address: this.address };
    if (this.chosenLang) stored.lang = this.chosenLang;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {}
  }
}

// the theme lives on the html element, the tokens in app.css switch on it
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
}

export const preferences = new Preferences();
