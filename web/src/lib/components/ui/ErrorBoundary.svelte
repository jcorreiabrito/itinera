<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    fallback,
  }: {
    children: Snippet;
    fallback?: Snippet<[Error, () => void]>;
  } = $props();

  let error = $state<Error | null>(null);

  function reset() {
    error = null;
  }
</script>

<svelte:boundary onerror={(e) => {
  error = e instanceof Error ? e : new Error(String(e));
}}>
  {#if error}
    {#if fallback}
      {@render fallback(error, reset)}
    {:else}
      <div class="rounded-lg border border-danger/30 bg-danger/5 p-4 text-ink my-2">
        <div class="flex items-center space-x-2 text-danger font-semibold mb-1">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Something went wrong in this section</span>
        </div>
        <p class="text-sm text-ink-muted mb-3">{error.message}</p>
        <button
          type="button"
          onclick={reset}
          class="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-surface text-ink border border-border hover:bg-surface-sunken transition-colors"
        >
          Try again
        </button>
      </div>
    {/if}
  {:else}
    {@render children()}
  {/if}
</svelte:boundary>
