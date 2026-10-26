/**
 * The printable document: paper profiles, cover sheet, sectional pages.
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
export const printDocEn = {
	print_cover: 'Trip booklet',
	print_contents: 'Contents',
	print_document: 'Document',
	print_paper: 'Paper',
	print_paper_a4: 'A4',
	print_paper_letter: 'Letter',
	print_doc_all: 'Whole trip',
	print_doc_itinerary: 'Itinerary',
	print_doc_costs: 'Costs',
	print_doc_checklist: 'Checklist',
	print_doc_bookings: 'Bookings & tickets',
	print_empty: 'This document has nothing to print yet.',
	print_server_pdf: 'Download server PDF',
	print_cover_check_in: 'Check-in details',
	print_cover_flights: 'Flights',
	print_cover_stays: 'Stays',
	print_address: 'Address',
	print_phone: 'Phone',
	print_qr_caption: 'Scan at check-in',
	print_cut_here: 'Cut here',
	print_checklist_title: 'Trip checklist',
	print_per_person: 'Per person',
	print_missing_rate_one: 'One amount needs an exchange rate and is not included in these totals.',
	print_missing_rate_many: '{n} amounts need an exchange rate and are not included in these totals.'
} satisfies Record<string, string>;

export const printDocPt = {
	print_cover: 'Livrete da viagem',
	print_contents: 'Índice',
	print_document: 'Documento',
	print_paper: 'Papel',
	print_paper_a4: 'A4',
	print_paper_letter: 'Carta',
	print_doc_all: 'Viagem completa',
	print_doc_itinerary: 'Itinerário',
	print_doc_costs: 'Custos',
	print_doc_checklist: 'Lista de verificação',
	print_doc_bookings: 'Reservas e bilhetes',
	print_empty: 'Este documento ainda não tem nada para imprimir.',
	print_server_pdf: 'Descarregar PDF do servidor',
	print_cover_check_in: 'Detalhes do check-in',
	print_cover_flights: 'Voos',
	print_cover_stays: 'Estadias',
	print_address: 'Morada',
	print_phone: 'Telefone',
	print_qr_caption: 'Digitalizar no check-in',
	print_cut_here: 'Cortar aqui',
	print_checklist_title: 'Lista de verificação da viagem',
	print_per_person: 'Por pessoa',
	print_missing_rate_one:
		'Um montante precisa de uma taxa de câmbio e não está incluído nestes totais.',
	print_missing_rate_many:
		'{n} montantes precisam de uma taxa de câmbio e não estão incluídos nestes totais.'
} satisfies Record<string, string>;
