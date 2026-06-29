<script lang="ts">
    import { reservations } from '$lib/db';
    import type { Reservation } from '$lib/db';
    import {
        ExternalLink,
        MoreVertical,
        Paperclip,
        Pencil,
        Phone,
        Trash2
    } from 'lucide-svelte';
    import { Badge, MenuItem, Popover } from '$lib/components/ui';
    import { formatMoney, formatNights, formatTime } from '$lib/format';
    import { detailSummary, kindMeta, type ReservationRowKind } from './kinds';

    interface Props {
        reservation: Reservation;
        rowKind: ReservationRowKind;
        homeCurrency?: string;
        attachmentCount?: number;
        onedit: () => void;
        ondelete: () => void;
    }

    let {
        reservation,
        rowKind,
        homeCurrency = 'EUR',
        attachmentCount = 0,
        onedit,
        ondelete
    }: Props = $props();

    let menuOpen = $state(false);

    const meta = $derived(kindMeta(reservation.kind ?? ''));
    const Icon = $derived(meta.icon);
    const name = $derived(reservation.name?.trim() || meta.label);
    const nights = $derived(reservations.lodgingNights(reservation));
    const time = $derived(
        rowKind === 'checkout' ? reservation.end : reservation.start
    );
    const summary = $derived(detailSummary(reservation));
    const placement = $derived(
        rowKind === 'checkin' ? 'Check-in' : rowKind === 'checkout' ? 'Check-out' : ''
    );
    const contact = $derived(reservation.contact);

    const ariaLabel = $derived.by(() => {
        const parts: string[] = [meta.label];
        if (placement) parts.push(placement.toLowerCase());
        if (reservation.kind === 'lodging' && rowKind === 'checkin' && nights > 0)
            parts.push(formatNights(nights));
        return parts.join(', ');
    });

    function act(fn?: () => void) {
        menuOpen = false;
        fn?.();
    }
</script>

<li aria-label={ariaLabel} class="relative flex items-start gap-3">
    <span
        class="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-700 [&_svg]:size-4"
        aria-hidden="true"
    >
        <Icon />
    </span>

    <div class="min-w-0 flex-1 rounded-lg border border-border bg-surface p-3 shadow-soft">
        <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
                    <span class="break-words">{name}</span>
                    {#if placement}
                        <Badge variant={rowKind === 'checkin' ? 'primary' : 'neutral'}>{placement}</Badge>
                    {/if}
                </p>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                    <span>{meta.label}</span>
                    {#if time}<span aria-hidden="true">·</span><span class="tabular-nums">{time}</span>{/if}
                    {#if reservation.kind === 'lodging' && rowKind === 'checkin' && nights > 0}
                        <span aria-hidden="true">·</span><span>{formatNights(nights)}</span>
                    {/if}
                    {#if summary}<span aria-hidden="true">·</span><span class="truncate">{summary}</span>{/if}
                </p>
            </div>
        </div>

        {#if reservation.location?.name || reservation.confirmation || reservation.cost != null || attachmentCount > 0 || contact?.url}
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                {#if reservation.location?.name}
                    <Badge variant="neutral">{reservation.location.name}</Badge>
                {/if}
                {#if reservation.confirmation}
                    <Badge variant="neutral">Conf. {reservation.confirmation}</Badge>
                {/if}
                {#if reservation.cost != null}
                    <Badge variant="neutral">{formatMoney(reservation.cost, reservation.currency ?? homeCurrency)}</Badge>
                {/if}
                {#if attachmentCount > 0}
                    <span class="inline-flex items-center gap-1 text-xs text-ink-muted">
                        <Paperclip class="size-3.5" aria-hidden="true" />
                        {attachmentCount}
                    </span>
                {/if}
                {#if contact?.url}
                    <a
                        href={contact.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline [&_svg]:size-3.5"
                    >
                        <ExternalLink /> Website
                    </a>
                {/if}
                {#if contact?.phone}
                    <a
                        href={`tel:${contact.phone}`}
                        class="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline [&_svg]:size-3.5"
                    >
                        <Phone /> Call
                    </a>
                {/if}
            </div>
        {/if}
    </div>

    <Popover bind:open={menuOpen} label="Reservation actions">
        {#snippet trigger({ toggle, open })}
            <button
                type="button"
                onclick={toggle}
                aria-label="Reservation actions"
                aria-haspopup="true"
                aria-expanded={open}
                class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-4"
            >
                <MoreVertical />
            </button>
        {/snippet}
        <MenuItem icon={Pencil} onclick={() => act(onedit)}>Edit</MenuItem>
        <MenuItem icon={Trash2} tone="danger" onclick={() => act(ondelete)}>Delete</MenuItem>
    </Popover>
</li>
