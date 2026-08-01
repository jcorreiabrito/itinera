<script lang="ts">
  import { theme, type Theme } from '$lib/stores/theme.svelte';

  function toggleTheme() {
    if (theme.current === 'light') {
      theme.set('dark');
    } else if (theme.current === 'dark') {
      theme.set('system');
    } else {
      theme.set('light');
    }
  }
</script>

<button
  type="button"
  onclick={toggleTheme}
  class="inline-flex items-center justify-center rounded-md p-2 text-ink-muted hover:bg-surface-sunken hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
  title={`Theme: ${theme.current} (click to change)`}
  aria-label={`Current theme is ${theme.current}. Click to toggle.`}
>
  {#if theme.isDark}
    <!-- Moon Icon -->
    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  {:else if theme.current === 'system'}
    <!-- Monitor / System Icon -->
    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  {:else}
    <!-- Sun Icon -->
    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  {/if}
</button>
