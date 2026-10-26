/**
 * Weather-aware planning.
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
export const weatherEn = {
	weather_day_summary: 'Forecast for this day: {summary}',
	weather_temp_range: '{min} to {max} degrees Celsius',
	weather_badge_temp: '{max}° / {min}°C',
	weather_badge_chance: '{p}%',
	weather_badge_amount: '{mm} mm',
	weather_precip_chance: '{p}% chance of precipitation',
	weather_precip_amount: '{mm} mm of rain expected',
	weather_move_outdoor: 'Move outdoor items to the driest day',
	weather_driest_title: 'A drier day nearby',
	weather_driest_body:
		'This day has a {current}% chance of precipitation. {target} is the driest nearby day, at {targetChance}%.',
	weather_driest_target_forecast: '{date}: {p}% chance of precipitation, {min}–{max}°C',
	weather_driest_none_title: 'No drier day nearby',
	weather_driest_none_body:
		'Within three days of {date}, no day is forecast to be drier, so there is nothing to move.',
	weather_driest_confirm_one: 'Move {n} item',
	weather_driest_confirm_many: 'Move {n} items',
	weather_driest_moved_one: 'Moved {n} outdoor item to {date}.',
	weather_driest_moved_many: 'Moved {n} outdoor items to {date}.',
	weather_driest_failed: 'Could not move the outdoor items. Try again.'
} satisfies Record<string, string>;

export const weatherPt = {
	weather_day_summary: 'Previsão para este dia: {summary}',
	weather_temp_range: '{min} a {max} graus Celsius',
	weather_badge_temp: '{max}° / {min}°C',
	weather_badge_chance: '{p}%',
	weather_badge_amount: '{mm} mm',
	weather_precip_chance: '{p}% de chance de precipitação',
	weather_precip_amount: '{mm} mm de chuva previstos',
	weather_move_outdoor: 'Mover itens ao ar livre para o dia mais seco',
	weather_driest_title: 'Um dia mais seco por perto',
	weather_driest_body:
		'Este dia tem {current}% de chance de precipitação. {target} é o dia mais seco por perto, com {targetChance}%.',
	weather_driest_target_forecast: '{date}: {p}% de chance de precipitação, {min}–{max}°C',
	weather_driest_none_title: 'Nenhum dia mais seco por perto',
	weather_driest_none_body:
		'Nos três dias em torno de {date}, nenhum dia está previsto como mais seco, então não há nada para mover.',
	weather_driest_confirm_one: 'Mover {n} item',
	weather_driest_confirm_many: 'Mover {n} itens',
	weather_driest_moved_one: '{n} item ao ar livre movido para {date}.',
	weather_driest_moved_many: '{n} itens ao ar livre movidos para {date}.',
	weather_driest_failed: 'Não foi possível mover os itens ao ar livre. Tente novamente.'
} satisfies Record<string, string>;
