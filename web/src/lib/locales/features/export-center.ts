/**
 * Export center: choose, preview and print every document.
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
export const exportCenterEn = {
	export_center_title: 'Export center',
	export_center_lead:
		'Every trip document in one place. Choose what to print, the paper and the language; the document opens ready to print.',
	export_center_offline_note:
		'Printing is built on this device, so it works offline. The server PDF is rendered by your homelab server and needs it reachable.',
	export_center_includes: 'Includes',
	export_center_paper: 'Paper',
	export_center_paper_a4: 'A4',
	export_center_paper_letter: 'Letter',
	export_center_language: 'Document language',
	export_center_lang_en: 'English',
	export_center_lang_pt: 'Português',
	export_center_print: 'Print',
	export_center_print_doc: 'Print {document}',
	export_center_server_pdf: 'Download server PDF',
	export_center_server_pdf_desc: 'The whole booklet, rendered by the homelab server.',
	export_center_load_error: 'Could not load the export documents.',
	export_center_doc_all_title: 'Whole trip booklet',
	export_center_doc_all_desc: 'Cover, itinerary, bookings, checklist and costs in one document.',
	export_center_doc_itinerary_title: 'Itinerary',
	export_center_doc_itinerary_desc: 'Each day with its activities, to-dos and times.',
	export_center_doc_costs_title: 'Costs',
	export_center_doc_costs_desc: 'Budget, spend and the expense list.',
	export_center_doc_checklist_title: 'Checklist',
	export_center_doc_checklist_desc: 'Every group and item, with boxes to tick on paper.',
	export_center_doc_bookings_title: 'Bookings & tickets',
	export_center_doc_bookings_desc: 'Flights and reservations with references and contacts.',
	export_center_count_days: 'Days',
	export_center_count_items: 'Itinerary items',
	export_center_count_expenses: 'Expenses',
	export_center_count_checklist: 'Checklist items',
	export_center_count_flights: 'Flights',
	export_center_count_reservations: 'Reservations'
} satisfies Record<string, string>;

export const exportCenterPt = {
	export_center_title: 'Central de exportação',
	export_center_lead:
		'Todos os documentos da viagem num só lugar. Escolha o que imprimir, o papel e o idioma; o documento abre pronto a imprimir.',
	export_center_offline_note:
		'A impressão é feita neste dispositivo, por isso funciona offline. O PDF do servidor é gerado pelo servidor da casa e precisa que ele esteja acessível.',
	export_center_includes: 'Inclui',
	export_center_paper: 'Papel',
	export_center_paper_a4: 'A4',
	export_center_paper_letter: 'Carta',
	export_center_language: 'Idioma do documento',
	export_center_lang_en: 'English',
	export_center_lang_pt: 'Português',
	export_center_print: 'Imprimir',
	export_center_print_doc: 'Imprimir {document}',
	export_center_server_pdf: 'Descarregar PDF do servidor',
	export_center_server_pdf_desc: 'O livrete completo, gerado pelo servidor da casa.',
	export_center_load_error: 'Não foi possível carregar os documentos de exportação.',
	export_center_doc_all_title: 'Livrete da viagem completa',
	export_center_doc_all_desc:
		'Capa, itinerário, reservas, lista de verificação e custos num só documento.',
	export_center_doc_itinerary_title: 'Itinerário',
	export_center_doc_itinerary_desc: 'Cada dia com as atividades, tarefas e horas.',
	export_center_doc_costs_title: 'Custos',
	export_center_doc_costs_desc: 'Orçamento, gastos e a lista de despesas.',
	export_center_doc_checklist_title: 'Lista de verificação',
	export_center_doc_checklist_desc: 'Todos os grupos e itens, com caixas para assinalar no papel.',
	export_center_doc_bookings_title: 'Reservas e bilhetes',
	export_center_doc_bookings_desc: 'Voos e reservas com referências e contactos.',
	export_center_count_days: 'Dias',
	export_center_count_items: 'Itens do itinerário',
	export_center_count_expenses: 'Despesas',
	export_center_count_checklist: 'Itens da lista',
	export_center_count_flights: 'Voos',
	export_center_count_reservations: 'Reservas'
} satisfies Record<string, string>;
