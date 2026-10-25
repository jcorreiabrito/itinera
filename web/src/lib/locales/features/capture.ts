/**
 * Quick Capture: one-thumb expense / photo / note entry from anywhere.
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
export const captureEn = {
	capture_title: 'Quick capture',
	capture_description: 'Expense, note or photo — stored on this device.',
	capture_modes: 'What are you saving',
	capture_mode_expense: 'Expense',
	capture_mode_note: 'Note',
	capture_mode_photo: 'Photo',
	capture_amount: 'Amount',
	capture_amount_required: 'Enter an amount.',
	capture_amount_invalid: 'Enter a valid amount, like 12.50 or 12,50.',
	capture_fx_invalid: 'Enter a positive exchange rate.',
	capture_note_title_placeholder: 'e.g. The wine bar on the corner',
	capture_note_body_placeholder: 'Anything you want to remember…',
	capture_note_title_required: 'Give this note a title.',
	capture_unscheduled: 'No day (unscheduled)',
	capture_unscheduled_hint: 'The note stays in the Unscheduled list instead of today.',
	capture_take_photo: 'Take or choose a photo',
	capture_change_photo: 'Choose another photo',
	capture_image_only: 'That file is not an image.',
	capture_photo_preview: 'Selected photo',
	capture_photo_hint: 'Kept with this trip on this device.',
	capture_save_expense: 'Save expense',
	capture_save_note: 'Save note',
	capture_save_photo: 'Save photo',
	capture_saved_on_device: 'Saved on this device',
	capture_save_failed_title: "Couldn't save this",
	capture_expense_failed: 'The expense was not saved. Your entry is still here — try again.',
	capture_note_failed: 'The note was not saved. Your text is still here — try again.',
	capture_photo_failed: 'The photo was not saved. Try again.'
} satisfies Record<string, string>;

export const capturePt = {
	capture_title: 'Captura rápida',
	capture_description: 'Despesa, nota ou foto — salvo neste dispositivo.',
	capture_modes: 'O que você está salvando',
	capture_mode_expense: 'Despesa',
	capture_mode_note: 'Nota',
	capture_mode_photo: 'Foto',
	capture_amount: 'Valor',
	capture_amount_required: 'Informe um valor.',
	capture_amount_invalid: 'Informe um valor válido, como 12,50.',
	capture_fx_invalid: 'Informe uma taxa de câmbio positiva.',
	capture_note_title_placeholder: 'ex.: o bar de vinhos da esquina',
	capture_note_body_placeholder: 'Qualquer coisa que você queira lembrar…',
	capture_note_title_required: 'Dê um título a esta nota.',
	capture_unscheduled: 'Sem dia (não agendada)',
	capture_unscheduled_hint: 'A nota fica na lista Sem agendamento em vez de hoje.',
	capture_take_photo: 'Tirar ou escolher uma foto',
	capture_change_photo: 'Escolher outra foto',
	capture_image_only: 'Esse arquivo não é uma imagem.',
	capture_photo_preview: 'Foto selecionada',
	capture_photo_hint: 'Guardada com esta viagem neste dispositivo.',
	capture_save_expense: 'Salvar despesa',
	capture_save_note: 'Salvar nota',
	capture_save_photo: 'Salvar foto',
	capture_saved_on_device: 'Salvo neste dispositivo',
	capture_save_failed_title: 'Não foi possível salvar',
	capture_expense_failed: 'A despesa não foi salva. Seus dados continuam aqui — tente novamente.',
	capture_note_failed: 'A nota não foi salva. Seu texto continua aqui — tente novamente.',
	capture_photo_failed: 'A foto não foi salva. Tente novamente.'
} satisfies Record<string, string>;
