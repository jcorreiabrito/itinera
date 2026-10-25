/**
 * Command palette and global keyboard layer.
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
export const commandEn = {
	command_title: 'Command palette',
	command_search: 'Search trips, sections and actions…',
	command_search_label: 'Search commands',
	command_results: 'Results',
	command_group_trips: 'Trips',
	command_group_trip: 'This trip',
	command_group_actions: 'Actions',
	command_no_results: 'No matches. Try a different search.',
	command_hint: 'Arrow keys to move, Enter to open, Esc to close',
	command_new_trip: 'New trip',
	command_settings: 'Settings',
	command_data_safety: 'Data safety',
	command_trash: 'Trash',
	command_conflicts: 'Conflicts',
	command_print: 'Print or export',
	command_toggle_theme: 'Toggle theme',
	command_toggle_language: 'Toggle language'
} satisfies Record<string, string>;

export const commandPt = {
	command_title: 'Paleta de comandos',
	command_search: 'Buscar viagens, seções e ações…',
	command_search_label: 'Buscar comandos',
	command_results: 'Resultados',
	command_group_trips: 'Viagens',
	command_group_trip: 'Esta viagem',
	command_group_actions: 'Ações',
	command_no_results: 'Nenhum resultado. Tente outra busca.',
	command_hint: 'Setas para mover, Enter para abrir, Esc para fechar',
	command_new_trip: 'Nova viagem',
	command_settings: 'Configurações',
	command_data_safety: 'Segurança dos dados',
	command_trash: 'Lixeira',
	command_conflicts: 'Conflitos',
	command_print: 'Imprimir ou exportar',
	command_toggle_theme: 'Alternar tema',
	command_toggle_language: 'Alternar idioma'
} satisfies Record<string, string>;
