/**
 * Today mode: the now card, what's next, today's tickets.
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
export const todayEn = {
	today_title: 'Today',
	today_now: 'Now',
	today_progress_label: 'Progress through {title}',
	today_minutes_left: '{duration} left',
	today_in_duration: 'in {duration}',
	today_done_for_today: 'Done for today',
	today_done_desc: 'Nothing else is planned for today.',
	today_nothing_timed: 'Nothing is set for a time today.',
	today_open_itinerary: 'Open itinerary',
	today_before: 'Your trip starts soon',
	today_first_day: 'First day',
	today_after_title: 'This trip has ended',
	today_after_desc: 'The itinerary and bookings are still here whenever you look back.',
	today_needs_dates: 'Add your trip dates to see each day here.',
	today_todos: 'To-dos today',
	today_tickets: 'Flights & bookings today'
} satisfies Record<string, string>;

export const todayPt = {
	today_title: 'Hoje',
	today_now: 'Agora',
	today_progress_label: 'Progresso em {title}',
	today_minutes_left: 'faltam {duration}',
	today_in_duration: 'em {duration}',
	today_done_for_today: 'Por hoje é tudo',
	today_done_desc: 'Não há mais nada planejado para hoje.',
	today_nothing_timed: 'Nada está marcado para uma hora hoje.',
	today_open_itinerary: 'Abrir itinerário',
	today_before: 'A sua viagem começa em breve',
	today_first_day: 'Primeiro dia',
	today_after_title: 'Esta viagem terminou',
	today_after_desc: 'O itinerário e as reservas ficam aqui para quando quiser recordar.',
	today_needs_dates: 'Adicione as datas da viagem para ver cada dia aqui.',
	today_todos: 'Tarefas de hoje',
	today_tickets: 'Voos e reservas hoje'
} satisfies Record<string, string>;
