<script lang="ts">
  import { onMount } from 'svelte';
  import { listConflicts, markConflictReviewed, trips } from '$lib/db';
  import { ArrowLeft, GitMerge, Check } from 'lucide-svelte';
  import { Badge, Button, EmptyState, Skeleton, SyncStatusPill, toast } from '$lib/components/ui';
  import { relativeTime } from '$lib/format';
  import { startLive } from '$lib/live';

  type Report = Awaited<ReturnType<typeof listConflicts>>[number];
  type StoredDoc = Report['winner'];

  let loaded = $state(false);
  let reports = $state<Report[]>([]);
  let tripTitles = $state<Map<string, string>>(new Map());
  let busy = $state<string | null>(null);

  async function load() {
    try {
      const [list, allTrips] = await Promise.all([listConflicts(), trips.list()]);
      reports = list;
      tripTitles = new Map(allTrips.map((t) => [t._id, t.title?.trim() || 'Untitled trip']));
    } catch {
      toast.error('Could not load the change history.');
    } finally {
      loaded = true;
    }
  }

  onMount(() => {
    load();
    return startLive(load);
  });

  const TYPE_LABELS: Record<string, string> = {
    trip: 'Trip',
    tripDay: 'Itinerary day',
    itineraryItem: 'Itinerary item',
    checklistItem: 'Checklist item',
    checklistTemplate: 'Checklist template',
    flight: 'Flight booking',
    reservation: 'Reservation',
    expense: 'Expense',
    attachment: 'Attachment',
    settings: 'Settings'
  };

  function typeLabel(doc: StoredDoc): string {
    return TYPE_LABELS[doc.type ?? ''] ?? 'Record';
  }

  function docName(doc: StoredDoc): string {
    const d = doc as Record<string, unknown>;
    return (
      (d.title as string) ??
      (d.name as string) ??
      (d.text as string) ??
      (d.description as string) ??
      ''
    );
  }

  function tripContext(doc: StoredDoc): string {
    const d = doc as Record<string, unknown>;
    if (doc.type === 'trip') return '';
    const tripid = d.tripid as string | undefined;
    if (!tripid) return '';
    return tripTitles.get(tripid) ?? '';
  }

  // Keys that are metadata or noise rather than user-visible content.
  const IGNORED = new Set([
    'type',
    'tripid',
    '_schemaVersion',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'order'
  ]);

  function humanize(key: string): string {
    return key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase())
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase());
  }

  function changedFields(winner: StoredDoc, loser: StoredDoc): string[] {
    const w = winner as Record<string, unknown>;
    const l = loser as Record<string, unknown>;
    const keys = new Set([...Object.keys(w), ...Object.keys(l)]);
    const out: string[] = [];
    for (const k of keys) {
      if (k.startsWith('_') || IGNORED.has(k)) continue;
      if (JSON.stringify(w[k]) !== JSON.stringify(l[k])) out.push(humanize(k));
    }
    return out;
  }

  async function dismiss(report: Report) {
    busy = report.id;
    try {
      await markConflictReviewed(report.id);
      reports = reports.filter((r) => r.id !== report.id);
      toast.success('Marked as reviewed.');
    } catch {
      toast.error('Could not update. Try again.');
    } finally {
      busy = null;
    }
  }
</script>

<svelte:head>
  <title>Review changes – Itinera</title>
</svelte:head>

<header class="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
  <div class="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
    <div class="flex items-center gap-2">
      <a
        href="/settings"
        aria-label="Back to settings"
        class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-5"
      >
        <ArrowLeft />
      </a>
      <h1 class="font-serif text-xl font-semibold">Review changes</h1>
    </div>
    <SyncStatusPill />
  </div>
</header>

<main class="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
  <p class="flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink-muted [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary-700">
    <Check />
    <span>
      When the same thing is edited on two devices offline, Itinera automatically keeps the most
      recent version. The replaced versions are saved here so nothing is ever lost.
    </span>
  </p>

  {#if !loaded}
    <div class="space-y-4">
      <Skeleton class="h-28 w-full rounded-lg" />
      <Skeleton class="h-28 w-full rounded-lg" />
    </div>
  {:else if reports.length === 0}
    <EmptyState
      icon={GitMerge}
      title="No conflicts – everything's in sync."
      description="If two devices ever disagree after editing offline, the replaced versions will show up here for you to review."
    />
  {:else}
    <ul class="space-y-4">
      {#each reports as report (report.id)}
        {@const context = tripContext(report.winner)}
        {@const name = docName(report.winner)}
        <li class="rounded-lg border border-border bg-surface p-4 shadow-soft">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{typeLabel(report.winner)}</Badge>
                {#if name}<span class="truncate font-medium text-ink">{name}</span>{/if}
              </div>
              {#if context}
                <p class="mt-1 text-xs text-ink-muted">{context}</p>
              {/if}
              <p class="mt-1.5 text-sm text-ink">
                Kept the version saved {relativeTime(report.winner.updatedAt) || 'most recently'}.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onclick={() => dismiss(report)}
              disabled={busy === report.id}
            >
              {busy === report.id ? 'Saving…' : 'Mark reviewed'}
            </Button>
          </div>

          <div class="mt-3 space-y-2 border-t border-border pt-3">
            {#each report.losers as loser (loser._rev)}
              {@const fields = changedFields(report.winner, loser)}
              <div class="text-xs text-ink-muted">
                <span class="font-medium text-ink">Set aside</span>
                · edited {relativeTime(loser.updatedAt) || 'at an unknown time'}
                {#if fields.length}
                  · differs in <span class="text-ink">{fields.join(', ')}</span>
                {:else}
                  · identical content
                {/if}
              </div>
            {/each}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>
