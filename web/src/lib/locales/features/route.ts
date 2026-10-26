/**
 * Day route optimizer.
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
export const routeEn = {
	route_optimise_action: 'Optimise walking',
	route_optimise_title: 'Shorter walking order',
	route_optimise_desc: 'Reorders this day’s untimed stops. Times and bookings are left alone.',
	route_optimise_current: 'Current route: {km} km',
	route_optimise_result: 'Optimised route: {km} km',
	route_optimise_saving: 'Saves {km} km · about {minutes} min of walking',
	route_optimise_none: 'These stops are already in a short order.',
	route_optimise_new_order: 'New order',
	route_optimise_apply: 'Apply order',
	route_optimise_applied: 'Walking order updated.',
	route_optimise_failed: 'Could not update the walking order. Try again.'
} satisfies Record<string, string>;

export const routePt = {
	route_optimise_action: 'Otimizar a caminhada',
	route_optimise_title: 'Ordem a pé mais curta',
	route_optimise_desc:
		'Reordena as paradas sem horário deste dia. Horários e reservas não são alterados.',
	route_optimise_current: 'Percurso atual: {km} km',
	route_optimise_result: 'Percurso otimizado: {km} km',
	route_optimise_saving: 'Poupa {km} km · cerca de {minutes} min a pé',
	route_optimise_none: 'Estas paradas já estão numa ordem curta.',
	route_optimise_new_order: 'Nova ordem',
	route_optimise_apply: 'Aplicar ordem',
	route_optimise_applied: 'Ordem a pé atualizada.',
	route_optimise_failed: 'Não foi possível atualizar a ordem a pé. Tente novamente.'
} satisfies Record<string, string>;
