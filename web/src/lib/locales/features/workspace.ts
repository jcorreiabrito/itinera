/**
 * Wide planning workspace: day list, docked map, item inspector.
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
export const workspaceEn = {
	workspace_days: 'Days',
	workspace_unscheduled: 'Unscheduled',
	workspace_item_count: '{n} items',
	workspace_inspector: 'Item inspector',
	workspace_select_item: 'Select an item',
	workspace_select_item_desc: 'Pick an activity in the day or on the map to edit it here.',
	workspace_no_search_results: 'No activity matches the search criteria.',
	workspace_clear_filters: 'Clear filters'
} satisfies Record<string, string>;

export const workspacePt = {
	workspace_days: 'Dias',
	workspace_unscheduled: 'Sem data',
	workspace_item_count: '{n} itens',
	workspace_inspector: 'Inspetor de item',
	workspace_select_item: 'Selecione um item',
	workspace_select_item_desc: 'Escolha uma atividade no dia ou no mapa para editá-la aqui.',
	workspace_no_search_results: 'Nenhuma atividade corresponde aos critérios de busca.',
	workspace_clear_filters: 'Limpar filtros'
} satisfies Record<string, string>;
