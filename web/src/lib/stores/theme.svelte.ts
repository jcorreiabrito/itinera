export type Theme = 'light' | 'dark' | 'system';

class ThemeState {
  current = $state<Theme>('system');
  isDark = $state<boolean>(false);

  init() {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('itinera_theme') as Theme | null;
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      this.current = saved;
    } else {
      this.current = 'system';
    }
    this.apply();

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.current === 'system') {
        this.apply();
      }
    });
  }

  set(newTheme: Theme) {
    this.current = newTheme;
    if (typeof window !== 'undefined') {
      localStorage.setItem('itinera_theme', newTheme);
    }
    this.apply();
  }

  private apply() {
    if (typeof window === 'undefined') return;
    let dark = false;
    if (this.current === 'dark') {
      dark = true;
    } else if (this.current === 'system') {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.isDark = dark;
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}

export const theme = new ThemeState();
