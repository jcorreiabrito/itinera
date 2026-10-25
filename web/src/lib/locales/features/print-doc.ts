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
	print_server_pdf: 'Download server PDF'
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
	print_server_pdf: 'Descarregar PDF do servidor'
} satisfies Record<string, string>;
