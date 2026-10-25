/**
 * Day feasibility: overlaps, tight transfers, how full a day is.
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
export const feasibilityEn = {
	feasibility_section_label: 'Day check',
	feasibility_overlap_title: 'Overlapping plans',
	feasibility_overlap_line: '{a} and {b} share {duration} ({window}).',
	feasibility_tight_title: 'Tight hand-offs',
	feasibility_tight_gap: 'Only {duration} between {before} and {after}.',
	feasibility_no_gap: 'No time between {before} and {after}.',
	feasibility_edit_item: 'Edit {name}',
	feasibility_meter_title: 'How full this day is',
	feasibility_packed: '{pct}% packed',
	feasibility_planned_of_awake: '{planned} planned in a {awake} day',
	feasibility_meter_label: 'Share of the day already planned',
	feasibility_fits_comfortably: 'Everything fits comfortably.'
} satisfies Record<string, string>;

export const feasibilityPt = {
	feasibility_section_label: 'Verificação do dia',
	feasibility_overlap_title: 'Planos sobrepostos',
	feasibility_overlap_line: '{a} e {b} se sobrepõem por {duration} ({window}).',
	feasibility_tight_title: 'Transições apertadas',
	feasibility_tight_gap: 'Só {duration} entre {before} e {after}.',
	feasibility_no_gap: 'Sem tempo entre {before} e {after}.',
	feasibility_edit_item: 'Editar {name}',
	feasibility_meter_title: 'Quão cheio está este dia',
	feasibility_packed: '{pct}% preenchido',
	feasibility_planned_of_awake: '{planned} planejadas em um dia de {awake}',
	feasibility_meter_label: 'Proporção do dia já planejada',
	feasibility_fits_comfortably: 'Tudo cabe com folga.'
} satisfies Record<string, string>;
