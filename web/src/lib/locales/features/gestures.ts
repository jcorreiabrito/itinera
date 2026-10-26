/**
 * Touch gestures: drag to reorder, swipe to act, swipe between days.
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
export const gesturesEn = {
	gestures_drag_item: 'Drag {title} to reorder',
	gestures_reordered: '{title} reordered',
	gestures_reorder_failed: 'Could not reorder the activity',
	gestures_drag_cancelled: 'Move cancelled',
	gestures_moved_to: 'Moved to {date}',
	gestures_move_failed: 'Could not move the activity',
	gestures_item_done: 'Checked off {title}',
	gestures_item_reopened: 'Reopened {title}'
} satisfies Record<string, string>;

export const gesturesPt = {
	gestures_drag_item: 'Arraste {title} para reordenar',
	gestures_reordered: 'Nova posição para {title}',
	gestures_reorder_failed: 'Não foi possível reordenar a atividade',
	gestures_drag_cancelled: 'Movimentação cancelada',
	gestures_moved_to: 'Movido para {date}',
	gestures_move_failed: 'Não foi possível mover a atividade',
	gestures_item_done: 'Marcado como feito: {title}',
	gestures_item_reopened: 'Reaberto: {title}'
} satisfies Record<string, string>;
