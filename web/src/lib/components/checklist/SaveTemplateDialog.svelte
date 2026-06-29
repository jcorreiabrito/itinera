<script lang="ts">
    import { checklist } from '$lib/db';
    import { Button, Dialog, Field, Input, toast } from '$lib/components/ui';

    interface Props {
        open?: boolean;
        /** Bare trip ULID. */
        tripId: string;
        /** Default trip name to prefill the template name. */
        suggestedName?: string;
        onsaved?: () => void;
    }

    let { open = $bindable(false), tripId, suggestedName = '', onsaved }: Props = $props();

    let name = $state('');
    let isDefault = $state(false);
    let saving = $state(false);
    let error = $state<string | null>(null);
    let wasOpen = false;

    $effect(() => {
        if (open && !wasOpen) {
            name = suggestedName;
            isDefault = false;
            error = null;
        }
        wasOpen = open;
    });

    async function save() {
        if (!name.trim()) {
            error = 'Give the template a name.';
            return;
        }
        saving = true;
        try {
            await checklist.saveAsTemplate(tripId, name.trim(), isDefault);
            open = false;
            toast.success('Saved as a template.');
            onsaved?.();
        } catch {
            toast.error('Could not save the template. Try again.');
        } finally {
            saving = false;
        }
    }
</script>

<Dialog
    bind:open
    title="Save as template"
    description="Snapshot this checklist (text, group, quantity, important) to reuse later."
>
    <div class="flex flex-col gap-4">
        <Field label="Template name" for="save-template-name" required error={error}>
            <Input
                id="save-template-name"
                value={name}
                placeholder="e.g. Carry-on only"
                invalid={!!error}
                oninput={(e) => {
                    name = e.currentTarget.value;
                    error = null;
                }}
            />
        </Field>
        <label class="flex items-center gap-3 text-sm">
            <input
                type="checkbox"
                checked={isDefault}
                class="size-5 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
                onchange={(e) => (isDefault = e.currentTarget.checked)}
            />
            <span class="font-medium text-ink">Offer this on new trips (default)</span>
        </label>
    </div>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
        <Button onclick={save} disabled={saving}>{saving ? 'Saving...' : 'Save template'}</Button>
    {/snippet}
</Dialog>