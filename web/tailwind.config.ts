import forms from '@tailwindcss/forms';
import type { Config } from 'tailwindcss';

/**
 * Itinera design system – implemented exactly from docs/13-ui-ux.md.
 * Locked: light theme only · cozy/warm · forest-green accent.
 */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}', './src/app.html'],
  theme: {
    extend: {
      colors: {
        // Forest-green accent
        primary: {
          100: '#E6F0EA',
          600: '#2F684F',
          700: '#245539',
        },
        // Warm highlights
        accent: {
          terracotta: '#C96B4A',
          amber: '#E0A458',
        },
        // Surfaces (warm paper)
        bg: '#BFE1F1',
        surface: {
          DEFAULT: '#FFFDF9',
          sunken: '#F4EEE4'
        },
        border: '#EAE1D4',
        // Text (warm near-black)
        ink: {
          DEFAULT: '#2A2620',
          muted: '#6F6557'
        },
        // Status
        success: '#3E8E5A',
        warning: '#C98A2B',
        danger: '#B4452F',
        info: '#3E6E8E'
      },
      fontFamily: {
        // Fraunces is the heading font (docs/13-ui-ux.md), self-hosted via
        // @fontsource/fraunces and imported in app.css; the warm serif stack is
        // the offline-safe fallback while the woff2 load.
        serif: ['Fraunces', 'ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        // Shape scale from the design system
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px'
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
        }
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
        'fade-in': 'fade-in 200ms ease-out both'
      }
    }
  },
  plugins: [forms]
} satisfies Config;
