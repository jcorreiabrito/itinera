/**
 * Recoverable conflict review.
 *
 * A feature-owned slice of the dictionary. Feature work adds its strings here
 * rather than at the bottom of `en.ts`, so two features can land at the same
 * time without both editing one 1,000-line object. `en.ts` and `pt-BR.ts`
 * spread every module in these folders; `locales.test.ts` is what proves the
 * slices do not overlap — a silently shadowed key is exactly the bug this
 * split could otherwise introduce.
 *
 * Both languages live in one file on purpose: a translator (or a later editor)
 * sees the English and the Portuguese side by side, which is how the rest of
 * the dictionary is written.
 */
export const conflictsEn = {
	conflict_choose_values: 'Choose the value to keep for each field.',
	conflict_kept_value: 'Kept',
	conflict_other_value: 'Other device',
	conflict_restore_selected: 'Restore selected',
	conflict_restoring: 'Restoring…',
	conflict_restored: 'Restored on this device. It syncs like any other edit.',
	conflict_restore_failed: 'Could not restore those values.',
	conflict_empty_value: '(empty)',
	conflict_fields_differ: '{n} fields differ',
	conflict_identical: 'Identical content'
} satisfies Record<string, string>;

export const conflictsPt = {
	conflict_choose_values: 'Escolha o valor a manter em cada campo.',
	conflict_kept_value: 'Mantido',
	conflict_other_value: 'Outro dispositivo',
	conflict_restore_selected: 'Restaurar selecionados',
	conflict_restoring: 'Restaurando…',
	conflict_restored: 'Restaurado neste dispositivo. Sincroniza como qualquer outra edição.',
	conflict_restore_failed: 'Não foi possível restaurar esses valores.',
	conflict_empty_value: '(vazio)',
	conflict_fields_differ: '{n} campos diferentes',
	conflict_identical: 'Conteúdo idêntico'
} satisfies Record<string, string>;
