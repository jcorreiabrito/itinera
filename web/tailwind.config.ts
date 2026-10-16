import forms from '@tailwindcss/forms';
import type { Config } from 'tailwindcss';

/**
 * Itinera design system – cozy/warm, forest-green accent, light + dark themes.
 *
 * SINGLE SOURCE OF TRUTH: every colour below resolves to a `--color-*-rgb` token
 * defined in src/app.css. That is what makes dark mode work — `html.dark`
 * redefines those tokens and every utility follows.
 *
 * Never put a raw hex literal in this file. A literal cannot follow the dark
 * override, and an undefined step (e.g. `primary-800` with no `800` key) is
 * dropped silently by Tailwind with no build error and no warning — which is how
 * badges ended up rendering with no border and no background.
 */
export default {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}', './src/app.html'],
	theme: {
		extend: {
			colors: {
				// Forest-green accent — full ramp, every step backed by a token.
				primary: {
					50: 'rgb(var(--color-primary-50-rgb) / <alpha-value>)',
					100: 'rgb(var(--color-primary-100-rgb) / <alpha-value>)',
					200: 'rgb(var(--color-primary-200-rgb) / <alpha-value>)',
					300: 'rgb(var(--color-primary-300-rgb) / <alpha-value>)',
					400: 'rgb(var(--color-primary-400-rgb) / <alpha-value>)',
					500: 'rgb(var(--color-primary-500-rgb) / <alpha-value>)',
					600: 'rgb(var(--color-primary-600-rgb) / <alpha-value>)',
					700: 'rgb(var(--color-primary-700-rgb) / <alpha-value>)',
					800: 'rgb(var(--color-primary-800-rgb) / <alpha-value>)',
					900: 'rgb(var(--color-primary-900-rgb) / <alpha-value>)',
					950: 'rgb(var(--color-primary-950-rgb) / <alpha-value>)'
				},
				// Warm highlights
				accent: {
					terracotta: 'rgb(var(--color-accent-terracotta-rgb) / <alpha-value>)',
					amber: 'rgb(var(--color-accent-amber-rgb) / <alpha-value>)'
				},
				// Surfaces (warm paper in light, deep forest-charcoal in dark)
				bg: 'rgb(var(--color-bg-rgb) / <alpha-value>)',
				surface: {
					DEFAULT: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
					sunken: 'rgb(var(--color-surface-sunken-rgb) / <alpha-value>)'
				},
				border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
				// Text (warm near-black in light, crisp off-white in dark)
				ink: {
					DEFAULT: 'rgb(var(--color-ink-rgb) / <alpha-value>)',
					muted: 'rgb(var(--color-ink-muted-rgb) / <alpha-value>)'
				},
				// Status — token-backed so the dark overrides in app.css actually apply,
				// and AA-compliant as text on each theme's surface.
				success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
				warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
				danger: 'rgb(var(--color-danger-rgb) / <alpha-value>)',
				info: 'rgb(var(--color-info-rgb) / <alpha-value>)',
				// Alias used by destructive controls; previously undefined, so
				// `text-destructive` on an invalid form field produced no styling at all.
				destructive: 'rgb(var(--color-danger-rgb) / <alpha-value>)'
			},
			fontFamily: {
				// Fraunces is the heading font, self-hosted via @fontsource/fraunces and
				// imported in app.css; the warm serif stack is the offline-safe fallback
				// while the woff2 load.
				serif: ['var(--font-serif)'],
				sans: ['var(--font-sans)']
			},
			borderRadius: {
				// Shape scale, driven by the tokens in app.css.
				sm: 'var(--radius-sm)',
				md: 'var(--radius-md)',
				lg: 'var(--radius-lg)',
				xl: 'var(--radius-xl)'
			},
			boxShadow: {
				// Soft, low, slightly warm – depth without harshness
				soft: '0 1px 2px rgba(42, 38, 32, 0.04), 0 2px 8px rgba(42, 38, 32, 0.06)',
				card: '0 1px 3px rgba(42, 38, 32, 0.05), 0 6px 20px rgba(42, 38, 32, 0.06)',
				sheet: '0 -2px 28px rgba(42, 38, 32, 0.14), 0 8px 28px rgba(42, 38, 32, 0.12)'
			},
			minHeight: {
				touch: '44px'
			},
			minWidth: {
				touch: '44px'
			},
			transitionTimingFunction: {
				out: 'cubic-bezier(0.16, 1, 0.3, 1)'
			},
			keyframes: {
				shimmer: {
					'100%': { transform: 'translateX(100%)' }
				},
				'fade-in': {
					from: { opacity: '0' },
					to: { opacity: '1' }
				},
				'slide-up-fade': {
					from: { opacity: '0', transform: 'translateY(12px)' },
					to: { opacity: '1', transform: 'none' }
				},
				'slide-down-fade': {
					from: { opacity: '0', transform: 'translateY(-8px)' },
					to: { opacity: '1', transform: 'none' }
				},
				'slide-from-right': {
					from: { opacity: '0', transform: 'translateX(100%)' },
					to: { opacity: '1', transform: 'none' }
				},
				'slide-to-right': {
					from: { opacity: '1', transform: 'translateX(0)' },
					to: { opacity: '0', transform: 'translateX(100%)' }
				},
				'slide-to-down': {
					from: { opacity: '1', transform: 'translateY(0)' },
					to: { opacity: '0', transform: 'translateY(100%)' }
				},
				'pop-in': {
					from: { opacity: '0', transform: 'scale(0.92)' },
					to: { opacity: '1', transform: 'none' }
				},
				'pop-out': {
					from: { opacity: '1', transform: 'scale(1)' },
					to: { opacity: '0', transform: 'scale(0.92)' }
				},
				'bounce-soft': {
					'0%, 100%': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-5px)' }
				},
				'pulse-ring': {
					'0%': { boxShadow: '0 0 0 0 rgba(47,104,79,0.45)' },
					'70%': { boxShadow: '0 0 0 8px rgba(47,104,79,0)' },
					'100%': { boxShadow: '0 0 0 0 rgba(47,104,79,0)' }
				}
			},
			animation: {
				shimmer: 'shimmer 1.5s infinite',
				'fade-in': 'fade-in 200ms ease-out both',
				'slide-up': 'slide-up-fade 320ms cubic-bezier(0.16,1,0.3,1) both',
				'slide-down': 'slide-down-fade 240ms cubic-bezier(0.16,1,0.3,1) both',
				'slide-from-right': 'slide-from-right 320ms cubic-bezier(0.16,1,0.3,1) both',
				'slide-to-right': 'slide-to-right 220ms cubic-bezier(0.16,1,0.3,1) both',
				'slide-to-down': 'slide-to-down 220ms cubic-bezier(0.16,1,0.3,1) both',
				'pop-in': 'pop-in 200ms cubic-bezier(0.34,1.56,0.64,1) both',
				'pop-out': 'pop-out 180ms cubic-bezier(0.16,1,0.3,1) both',
				'bounce-soft': 'bounce-soft 2.8s ease-in-out infinite',
				'pulse-ring': 'pulse-ring 2s cubic-bezier(0.455,0.03,0.515,0.955) infinite'
			}
		}
	},
	plugins: [forms]
} satisfies Config;
