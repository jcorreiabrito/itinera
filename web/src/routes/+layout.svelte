<script lang="ts" module>
  // Bootstrap the data layer exactly once for the app's lifetime.
  let booted = false;
</script>

<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { initDb } from '$lib/db';
  import { Toaster, toast } from '$lib/components/ui';
  import ReloadPrompt from '$lib/components/ReloadPrompt.svelte';
  import OfflineBanner from '$lib/components/OfflineBanner.svelte';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    if (booted) return;
    booted = true;
    // Creates the local db, requests persistent storage, ensures indexes, runs
    // migrations, and starts live sync. The UI reads/writes local data only.
    initDb().catch((error) => {
      console.error('initDb failed', error);
      toast.error('Could not open local storage. Some features may be unavailable.');
    });
  });
</script>

<div class="flex min-h-dvh flex-col bg-bg">
  <OfflineBanner />
  {@render children()}
</div>

<Toaster />
<ReloadPrompt />
