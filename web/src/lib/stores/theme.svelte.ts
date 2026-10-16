export type Theme = 'light' | 'dark' | 'system';

/*
 * The two <meta name="theme-color"> tags in app.html are keyed on
 * `prefers-color-scheme`, which stops describing the app the moment the user
 * picks Light or Dark by hand — the OS query then matches the wrong palette and
 * a dark app gets a light status bar. Both tags are rewritten here instead.
 * These values must stay the ones app.html ships (asserted in theme.test.ts).
 */
export const THEME_COLOR: Record<'light' | 'dark', string> = {
	light: '#fbf7f1',
	dark: '#111613'
};

/** The status-bar colour for an effective theme — pure, so it can be asserted. */
export function themeColor(isDark: boolean): string {
	return isDark ? THEME_COLOR.dark : THEME_COLOR.light;
}

/**
 * Point every `theme-color` meta at the effective theme. Both tags are written,
 * not just the one whose media query matches: the media query is the OS's
 * answer, and the whole point is that the app's answer may differ. Rewriting
 * both keeps whichever tag the browser picks (the last matching one) correct.
 */
function applyThemeColor(isDark: boolean) {
	const color = themeColor(isDark);
	document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
		meta.content = color;
	});
}

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
		// Runs from init() too, so the meta is right from the first paint the app
		// controls — not only once the user opens the theme picker.
		applyThemeColor(dark);
	}
}

export const theme = new ThemeState();
