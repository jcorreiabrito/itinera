<script lang="ts" module>
  // Bootstrap the data layer exactly once for the app's lifetime.
  let booted = false;
</script>

<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { initDb } from '$lib/db';
  import { initLanguage } from '$lib/i18n.svelte';
  import { Toaster, toast } from '$lib/components/ui';
  import ReloadPrompt from '$lib/components/ReloadPrompt.svelte';
  import OfflineBanner from '$lib/components/OfflineBanner.svelte';

  import { theme } from '$lib/stores/theme.svelte';

  import * as dbRepo from '$lib/db';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    theme.init();
    if (booted) return;
    booted = true;
    // Load language preference from settings
    initLanguage();
    // Creates the local db, requests persistent storage, ensures indexes, runs
    // migrations, and starts live sync. The UI reads/writes local data only.
    initDb().then((db) => {
      if (typeof window !== 'undefined') {
        (window as any).db = db;
        if (import.meta.env.DEV) {
          (window as any).dbRepo = dbRepo;
        }
      }
    }).catch((error) => {
      console.error('initDb failed', error);
      toast.error('Could not open local storage. Some features may be unavailable.');
    });
  });
</script>

<a
  href="#main-content"
  class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-surface focus:text-ink focus:border focus:border-border focus:shadow-md"
>
  Skip to main content
</a>

<div class="flex min-h-dvh flex-col" id="main-content">
  <!-- Dynamic Gradient Mesh Background -->
  <div class="mesh-container" aria-hidden="true">
    <div class="mesh-orb mesh-orb-1"></div>
    <div class="mesh-orb mesh-orb-2"></div>
    <div class="mesh-orb mesh-orb-3"></div>
  </div>

  <OfflineBanner />
  {@render children()}
</div>

<Toaster />
<ReloadPrompt />
