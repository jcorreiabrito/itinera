/**
 * In-app restore from a server backup.
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
export const restoreEn = {
	restore_action: 'Restore',
	restore_title: 'Restore this backup?',
	restore_body:
		'The server saves a snapshot of the current data first, then writes the backup into the database. Records created since the backup are never deleted.',
	restore_replace: 'Also overwrite records that still exist',
	restore_replace_desc:
		'Off: only missing records are added. On: records in the backup replace the current versions.',
	restore_checking: 'Checking what would change…',
	restore_plan:
		'Will add {docs} records and {files} files; {untouched} existing records stay as they are.',
	restore_plan_replace: '{n} existing records will be overwritten from the backup.',
	restore_plan_none: 'Nothing to restore — every record in this backup already exists.',
	restore_missing_files: '{n} attachment files are missing from this backup and will be skipped.',
	restore_preview_failed: 'Could not check this backup. Is your home server reachable?',
	restore_confirm: 'Restore',
	restore_running: 'Restoring…',
	restore_done: 'Restored {docs} records and {files} files.',
	restore_failed: 'Restore failed. A safety snapshot was taken before it started.'
} satisfies Record<string, string>;

export const restorePt = {
	restore_action: 'Restaurar',
	restore_title: 'Restaurar este backup?',
	restore_body:
		'O servidor salva primeiro um snapshot dos dados atuais e depois grava o backup no banco. Registros criados após o backup nunca são apagados.',
	restore_replace: 'Substituir também os registros que ainda existem',
	restore_replace_desc:
		'Desligado: apenas registros ausentes são adicionados. Ligado: os registros do backup substituem as versões atuais.',
	restore_checking: 'Verificando o que mudaria…',
	restore_plan:
		'Serão adicionados {docs} registros e {files} arquivos; {untouched} registros existentes permanecem como estão.',
	restore_plan_replace: '{n} registros existentes serão substituídos pelo backup.',
	restore_plan_none: 'Nada a restaurar — todos os registros deste backup já existem.',
	restore_missing_files: '{n} arquivos anexos estão ausentes deste backup e serão ignorados.',
	restore_preview_failed:
		'Não foi possível verificar este backup. Seu servidor doméstico está acessível?',
	restore_confirm: 'Restaurar',
	restore_running: 'Restaurando…',
	restore_done: 'Restaurados {docs} registros e {files} arquivos.',
	restore_failed: 'Falha na restauração. Um snapshot de segurança foi criado antes de começar.'
} satisfies Record<string, string>;
