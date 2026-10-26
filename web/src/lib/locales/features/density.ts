/**
 * Width tiers and display density.
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
export const densityEn = {
	density_title: 'Display density',
	density_desc:
		'Compact tightens list rows and hides secondary details; open an item to see everything.',
	density_comfortable: 'Comfortable',
	density_compact: 'Compact'
} satisfies Record<string, string>;

export const densityPt = {
	density_title: 'Densidade da exibição',
	density_desc:
		'A opção compacta reduz a altura das linhas e oculta detalhes secundários; abra um item para ver tudo.',
	density_comfortable: 'Confortável',
	density_compact: 'Compacta'
} satisfies Record<string, string>;
