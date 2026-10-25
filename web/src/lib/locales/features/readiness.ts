/**
 * Readiness score: what still needs doing before departure.
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
export const readinessEn = {
	readiness_title: 'Trip readiness',
	readiness_subtitle_issues_one: '1 thing needs attention',
	readiness_subtitle_issues_many: '{n} things need attention',
	readiness_subtitle_clear: 'Everything essential is in place',
	readiness_score_aria: 'Readiness score: {score} out of 100',
	readiness_all_clear: 'All clear',
	readiness_all_clear_desc: 'Nothing needs your attention before departure.',
	readiness_show_details: 'Show what to fix',
	readiness_hide_details: 'Hide details',
	readiness_reservations_title: 'Bookings without a confirmation',
	readiness_reservations_detail_one: '"{name}" has no confirmation number.',
	readiness_reservations_detail_many: '"{name}" and {rest} more have no confirmation number.',
	readiness_flights_title: 'Flights missing check-in details',
	readiness_flights_detail_one:
		'"{name}" departs within 72 hours without a seat or booking reference.',
	readiness_flights_detail_many:
		'"{name}" and {rest} more depart within 72 hours without a seat or booking reference.',
	readiness_essentials_title: 'Essentials still unchecked',
	readiness_essentials_detail_one: '"{name}" is still unchecked.',
	readiness_essentials_detail_many: '"{name}" and {rest} more essentials are still unchecked.',
	readiness_fx_title: 'Costs missing an exchange rate',
	readiness_fx_detail_one: '"{name}" needs an exchange rate to count towards the budget.',
	readiness_fx_detail_many:
		'"{name}" and {rest} more costs need an exchange rate to count towards the budget.',
	readiness_lodging_title: 'No stay booked',
	readiness_lodging_detail_today: 'The trip starts today and no lodging is booked.',
	readiness_lodging_detail: 'The trip starts in {days} days and no lodging is booked.',
	readiness_attachments_title: 'Bookings without tickets attached',
	readiness_attachments_detail_one: '"{name}" has no ticket or voucher attached.',
	readiness_attachments_detail_many:
		'"{name}" and {rest} more bookings have no ticket or voucher attached.'
} satisfies Record<string, string>;

export const readinessPt = {
	readiness_title: 'Preparação da viagem',
	readiness_subtitle_issues_one: '1 coisa precisa de atenção',
	readiness_subtitle_issues_many: '{n} coisas precisam de atenção',
	readiness_subtitle_clear: 'Tudo o que é essencial está tratado',
	readiness_score_aria: 'Nível de preparação: {score} de 100',
	readiness_all_clear: 'Tudo em ordem',
	readiness_all_clear_desc: 'Nada precisa da sua atenção antes da partida.',
	readiness_show_details: 'Mostrar o que falta',
	readiness_hide_details: 'Ocultar detalhes',
	readiness_reservations_title: 'Reservas sem confirmação',
	readiness_reservations_detail_one: '"{name}" não tem número de confirmação.',
	readiness_reservations_detail_many: '"{name}" e mais {rest} não têm número de confirmação.',
	readiness_flights_title: 'Voos sem dados de check-in',
	readiness_flights_detail_one:
		'"{name}" parte nas próximas 72 horas sem lugar marcado ou referência de reserva.',
	readiness_flights_detail_many:
		'"{name}" e mais {rest} partem nas próximas 72 horas sem lugar marcado ou referência de reserva.',
	readiness_essentials_title: 'Essenciais por assinalar',
	readiness_essentials_detail_one: '"{name}" continua por assinalar.',
	readiness_essentials_detail_many: '"{name}" e mais {rest} essenciais continuam por assinalar.',
	readiness_fx_title: 'Custos sem taxa de câmbio',
	readiness_fx_detail_one: '"{name}" precisa de uma taxa de câmbio para contar para o orçamento.',
	readiness_fx_detail_many:
		'"{name}" e mais {rest} custos precisam de uma taxa de câmbio para contar para o orçamento.',
	readiness_lodging_title: 'Sem alojamento reservado',
	readiness_lodging_detail_today: 'A viagem começa hoje e não há alojamento reservado.',
	readiness_lodging_detail: 'A viagem começa daqui a {days} dias e não há alojamento reservado.',
	readiness_attachments_title: 'Reservas sem bilhetes anexados',
	readiness_attachments_detail_one: '"{name}" não tem bilhete ou voucher anexado.',
	readiness_attachments_detail_many:
		'"{name}" e mais {rest} reservas não têm bilhete ou voucher anexado.'
} satisfies Record<string, string>;
