/**
 * Cross-trip horizon.
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
export const horizonEn = {
	horizon_title: 'Trip horizon',
	horizon_subtitle: 'The next six months, and what still needs planning.',
	horizon_timeline_aria: 'Six-month trip timeline',
	horizon_upcoming_title: 'Next departures',
	horizon_undated_title: 'Dream trips',
	horizon_no_dated_trips: 'No dated trips in the next six months.',
	horizon_edit_dates: 'Edit dates',
	horizon_in_days_one: 'in 1 day',
	horizon_in_days: 'in {n} days',
	horizon_in_progress: 'in progress',
	horizon_flag_undated: 'Dates flexible',
	horizon_flag_no_itinerary: 'No itinerary',
	horizon_flag_no_checklist: 'No checklist',
	horizon_flag_no_budget: 'No budget',
	horizon_flag_no_lodging: 'No stay booked'
} satisfies Record<string, string>;

export const horizonPt = {
	horizon_title: 'Horizonte de viagens',
	horizon_subtitle: 'Os próximos seis meses e o que ainda falta planear.',
	horizon_timeline_aria: 'Cronologia de viagens dos próximos seis meses',
	horizon_upcoming_title: 'Próximas partidas',
	horizon_undated_title: 'Viagens dos sonhos',
	horizon_no_dated_trips: 'Sem viagens com datas nos próximos seis meses.',
	horizon_edit_dates: 'Editar datas',
	horizon_in_days_one: 'daqui a 1 dia',
	horizon_in_days: 'daqui a {n} dias',
	horizon_in_progress: 'a decorrer',
	horizon_flag_undated: 'Datas flexíveis',
	horizon_flag_no_itinerary: 'Sem itinerário',
	horizon_flag_no_checklist: 'Sem lista de tarefas',
	horizon_flag_no_budget: 'Sem orçamento',
	horizon_flag_no_lodging: 'Sem alojamento reservado'
} satisfies Record<string, string>;
