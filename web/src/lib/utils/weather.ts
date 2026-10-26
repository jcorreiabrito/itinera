/**
 * Weather service helper integrating Open-Meteo (free, keyless, privacy-friendly API)
 * with offline-first local caching.
 */

export interface DayWeather {
	date: string;
	maxTemp: number;
	minTemp: number;
	icon: string;
	description: string;
	/**
	 * Highest chance of precipitation in the day, in percent.
	 *
	 * Optional because a cache written before this field existed is still a
	 * valid forecast: callers must treat a missing value as "not known", never
	 * as zero.
	 */
	precipitationProbability?: number;
	/** Total precipitation in the day, in millimetres. Same cache caveat. */
	precipitationSum?: number;
}

interface OpenMeteoDaily {
	time?: string[];
	weather_code?: Array<number | null>;
	temperature_2m_max?: Array<number | null>;
	temperature_2m_min?: Array<number | null>;
	precipitation_probability_max?: Array<number | null>;
	precipitation_sum?: Array<number | null>;
}

interface OpenMeteoResponse {
	daily?: OpenMeteoDaily;
}

export interface WeatherForecast {
	latitude: number;
	longitude: number;
	days: Record<string, DayWeather>; // keyed by ISO date 'YYYY-MM-DD'
	updatedAt: string;
}

const WMO_CODE_MAP: Record<number, { icon: string; desc: string }> = {
	0: { icon: '☀️', desc: 'Clear sky' },
	1: { icon: '🌤️', desc: 'Mainly clear' },
	2: { icon: '⛅', desc: 'Partly cloudy' },
	3: { icon: '☁️', desc: 'Overcast' },
	45: { icon: '🌫️', desc: 'Foggy' },
	48: { icon: '🌫️', desc: 'Depositing rime fog' },
	51: { icon: '🌧️', desc: 'Light drizzle' },
	53: { icon: '🌧️', desc: 'Moderate drizzle' },
	55: { icon: '🌧️', desc: 'Dense drizzle' },
	61: { icon: '🌧️', desc: 'Slight rain' },
	63: { icon: '🌧️', desc: 'Moderate rain' },
	65: { icon: '🌧️', desc: 'Heavy rain' },
	71: { icon: '❄️', desc: 'Slight snow' },
	73: { icon: '❄️', desc: 'Moderate snow' },
	75: { icon: '❄️', desc: 'Heavy snow' },
	80: { icon: '🌦️', desc: 'Rain showers' },
	81: { icon: '🌦️', desc: 'Moderate showers' },
	82: { icon: '⛈️', desc: 'Violent showers' },
	95: { icon: '🌩️', desc: 'Thunderstorm' },
	96: { icon: '🌩️', desc: 'Thunderstorm with hail' }
};

function getWeatherMeta(code: number): { icon: string; desc: string } {
	return WMO_CODE_MAP[code] ?? { icon: '🌡️', desc: 'Weather' };
}

function getCacheKey(lat: number, lng: number): string {
	return `itinera_weather_${lat.toFixed(2)}_${lng.toFixed(2)}`;
}

export function loadCachedWeather(lat: number, lng: number): WeatherForecast | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(getCacheKey(lat, lng));
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export async function fetchTripWeather(lat: number, lng: number): Promise<WeatherForecast | null> {
	const cached = loadCachedWeather(lat, lng);

	/*
	 * The server render has no saved location and no reliable online state, and a
	 * forecast is never worth delaying the first paint for. Only the cache may be
	 * read there.
	 */
	if (typeof window === 'undefined') return cached;

	// If online, attempt to fetch fresh forecast
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return cached;
	}

	try {
		const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto`;
		const res = await fetch(url);
		if (!res.ok) return cached;

		const data = (await res.json()) as OpenMeteoResponse;
		const daily = data?.daily;
		if (!daily?.time) return cached;

		const days: Record<string, DayWeather> = {};
		const times = daily.time;
		const maxes = daily.temperature_2m_max ?? [];
		const mins = daily.temperature_2m_min ?? [];
		const codes = daily.weather_code ?? [];
		const probabilities = daily.precipitation_probability_max ?? [];
		const sums = daily.precipitation_sum ?? [];

		for (let i = 0; i < times.length; i++) {
			const date = times[i];
			const max = maxes[i];
			const min = mins[i];
			if (!date || typeof max !== 'number' || typeof min !== 'number') continue;
			if (!Number.isFinite(max) || !Number.isFinite(min)) continue;

			const code = codes[i];
			const meta = getWeatherMeta(typeof code === 'number' ? code : 0);
			const day: DayWeather = {
				date,
				maxTemp: Math.round(max),
				minTemp: Math.round(min),
				icon: meta.icon,
				description: meta.desc
			};

			const probability = probabilities[i];
			if (typeof probability === 'number' && Number.isFinite(probability)) {
				day.precipitationProbability = Math.round(probability);
			}

			const sum = sums[i];
			if (typeof sum === 'number' && Number.isFinite(sum)) {
				day.precipitationSum = Math.round(sum * 10) / 10;
			}

			days[date] = day;
		}

		const forecast: WeatherForecast = {
			latitude: lat,
			longitude: lng,
			days,
			updatedAt: new Date().toISOString()
		};

		if (typeof localStorage !== 'undefined') {
			try {
				localStorage.setItem(getCacheKey(lat, lng), JSON.stringify(forecast));
			} catch {
				/* offline forecast cache is best-effort */
			}
		}

		return forecast;
	} catch (err) {
		console.warn('Weather fetch failed, falling back to cache:', err);
		return cached;
	}
}
