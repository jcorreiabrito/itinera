/**
 * Paste a booking confirmation.
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
export const pasteEn = {
	paste_title: 'Paste a confirmation',
	paste_description: 'We read dates, references and contact details. Check them before saving.',
	paste_textarea_label: 'Confirmation text',
	paste_textarea_placeholder: 'Paste the email or booking confirmation here…',
	paste_parse: 'Read text',
	paste_nothing_found: 'No booking details found. Nothing has been changed.',
	paste_apply: 'Use selected fields',
	paste_applied: 'Fields added: {count}.',
	paste_no_change: 'No fields were changed.',
	paste_no_selection: 'Choose at least one field.',
	paste_confidence_high: 'High',
	paste_confidence_medium: 'Medium',
	paste_confidence_aria: '{level} confidence',
	paste_replace: 'Replace existing value',
	paste_current_value: 'Current: {value}',
	paste_kept_in_notes: 'Lines we could not read are kept in the notes.',
	paste_field_name: 'Name',
	paste_field_address: 'Address',
	paste_field_phone: 'Phone',
	paste_field_email: 'Email',
	paste_field_booking_ref: 'Confirmation code',
	paste_field_start_date: 'Start date',
	paste_field_start_time: 'Start time',
	paste_field_end_date: 'End date',
	paste_field_end_time: 'End time',
	paste_field_departure_date: 'Departure date',
	paste_field_departure_time: 'Departure time',
	paste_field_arrival_date: 'Arrival date',
	paste_field_arrival_time: 'Arrival time',
	paste_field_party_size: 'Party size',
	paste_field_flight_number: 'Flight number',
	paste_field_departure_airport: 'From airport',
	paste_field_arrival_airport: 'To airport',
	paste_field_passenger: 'Passenger'
} satisfies Record<string, string>;

export const pastePt = {
	paste_title: 'Colar uma confirmação',
	paste_description: 'Lemos datas, referências e contactos. Confira antes de guardar.',
	paste_textarea_label: 'Texto da confirmação',
	paste_textarea_placeholder: 'Cole aqui o e-mail ou a confirmação da reserva…',
	paste_parse: 'Ler texto',
	paste_nothing_found: 'Não encontramos dados da reserva. Nada foi alterado.',
	paste_apply: 'Usar campos selecionados',
	paste_applied: 'Campos adicionados: {count}.',
	paste_no_change: 'Nenhum campo foi alterado.',
	paste_no_selection: 'Escolha pelo menos um campo.',
	paste_confidence_high: 'Alta',
	paste_confidence_medium: 'Média',
	paste_confidence_aria: 'Confiança {level}',
	paste_replace: 'Substituir o valor atual',
	paste_current_value: 'Atual: {value}',
	paste_kept_in_notes: 'As linhas que não conseguimos ler ficam nas notas.',
	paste_field_name: 'Nome',
	paste_field_address: 'Endereço',
	paste_field_phone: 'Telefone',
	paste_field_email: 'E-mail',
	paste_field_booking_ref: 'Código de confirmação',
	paste_field_start_date: 'Data de início',
	paste_field_start_time: 'Hora de início',
	paste_field_end_date: 'Data de fim',
	paste_field_end_time: 'Hora de fim',
	paste_field_departure_date: 'Data de partida',
	paste_field_departure_time: 'Hora de partida',
	paste_field_arrival_date: 'Data de chegada',
	paste_field_arrival_time: 'Hora de chegada',
	paste_field_party_size: 'Número de pessoas',
	paste_field_flight_number: 'Número do voo',
	paste_field_departure_airport: 'Aeroporto de partida',
	paste_field_arrival_airport: 'Aeroporto de chegada',
	paste_field_passenger: 'Passageiro'
} satisfies Record<string, string>;
