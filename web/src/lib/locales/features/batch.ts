/**
 * Multi-select and batch operations.
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
export const batchEn = {
	batch_select: 'Select',
	batch_selected_one: '{n} selected',
	batch_selected_many: '{n} selected',
	batch_done: 'Done',
	batch_select_all: 'Select all',
	batch_clear: 'Clear',
	batch_actions: 'Batch actions',
	batch_delete_title_one: 'Delete {n} selected item?',
	batch_delete_title_many: 'Delete {n} selected items?',
	batch_delete_body: 'They move to Trash, where you can restore them.',
	batch_moved_one: 'Moved {n} item.',
	batch_moved_many: 'Moved {n} items.',
	batch_duplicated_one: 'Duplicated {n} item.',
	batch_duplicated_many: 'Duplicated {n} items.',
	batch_deleted_one: 'Moved {n} item to Trash.',
	batch_deleted_many: 'Moved {n} items to Trash.',
	batch_category: 'Change category',
	batch_categorised_one: 'Changed the category of {n} item.',
	batch_categorised_many: 'Changed the category of {n} items.',
	batch_partial: 'Done: {succeeded} of {total}; failed: {failed}.',
	batch_copy_suffix: '(copy)'
} satisfies Record<string, string>;

export const batchPt = {
	batch_select: 'Selecionar',
	batch_selected_one: '{n} selecionado',
	batch_selected_many: '{n} selecionados',
	batch_done: 'Concluir',
	batch_select_all: 'Selecionar todos',
	batch_clear: 'Limpar',
	batch_actions: 'Ações em lote',
	batch_delete_title_one: 'Excluir {n} item selecionado?',
	batch_delete_title_many: 'Excluir {n} itens selecionados?',
	batch_delete_body: 'Eles vão para a Lixeira, onde podem ser restaurados.',
	batch_moved_one: '{n} item movido.',
	batch_moved_many: '{n} itens movidos.',
	batch_duplicated_one: '{n} item duplicado.',
	batch_duplicated_many: '{n} itens duplicados.',
	batch_deleted_one: '{n} item movido para a Lixeira.',
	batch_deleted_many: '{n} itens movidos para a Lixeira.',
	batch_category: 'Alterar categoria',
	batch_categorised_one: 'Categoria de {n} item alterada.',
	batch_categorised_many: 'Categoria de {n} itens alterada.',
	batch_partial: 'Concluídos: {succeeded} de {total}; falhas: {failed}.',
	batch_copy_suffix: '(cópia)'
} satisfies Record<string, string>;
