/**
 * Ticket wallet: show-at-the-counter view for flights and stays.
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
export const walletEn = {
	// Navigation label for the section, and the page's own heading.
	wallet: 'Wallet',
	wallet_title: 'Tickets',
	wallet_subtitle: 'Show this at the counter.',
	wallet_next: 'Next',

	// The reference block – the one thing the clerk asks for.
	wallet_flight_ref: 'Booking reference',
	wallet_stay_ref: 'Confirmation number',
	wallet_no_reference: 'No reference saved',
	wallet_copy: 'Copy',
	wallet_copied: 'Copied',
	wallet_copy_ref: 'Copy reference {ref}',

	// Attachments, the edit shortcut and print.
	wallet_open_file: 'Open {name}',
	wallet_edit_booking: 'Edit booking',
	wallet_print: 'Print',

	// Empty state.
	wallet_empty_title: 'No tickets yet',
	wallet_empty_desc:
		'Add a flight or a stay and its reference, times and files show up here, ready to show at the counter.',
	wallet_empty_action: 'Add a booking',

	// A booking saved without the times the wallet would show.
	wallet_no_times: 'No times saved',
	wallet_not_set: 'Not set'
} satisfies Record<string, string>;

export const walletPt = {
	wallet: 'Carteira',
	wallet_title: 'Bilhetes',
	wallet_subtitle: 'Mostre isto no balcão.',
	wallet_next: 'Próximo',

	wallet_flight_ref: 'Referência da reserva',
	wallet_stay_ref: 'Número de confirmação',
	wallet_no_reference: 'Sem referência guardada',
	wallet_copy: 'Copiar',
	wallet_copied: 'Copiado',
	wallet_copy_ref: 'Copiar referência {ref}',

	wallet_open_file: 'Abrir {name}',
	wallet_edit_booking: 'Editar reserva',
	wallet_print: 'Imprimir',

	wallet_empty_title: 'Ainda sem bilhetes',
	wallet_empty_desc:
		'Adicione um voo ou uma estadia e a referência, os horários e os ficheiros aparecem aqui, prontos a mostrar no balcão.',
	wallet_empty_action: 'Adicionar reserva',

	wallet_no_times: 'Sem horários guardados',
	wallet_not_set: 'Por definir'
} satisfies Record<string, string>;
