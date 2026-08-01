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
  96: { icon: '🌩️', desc: 'Thunderstorm with hail' },
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

export async function fetchTripWeather(
  lat: number,
  lng: number
): Promise<WeatherForecast | null> {
  const cached = loadCachedWeather(lat, lng);

  // If online, attempt to fetch fresh forecast
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return cached;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return cached;

    const data = await res.json();
    if (!data?.daily?.time) return cached;

    const days: Record<string, DayWeather> = {};
    const times: string[] = data.daily.time;
    const maxes: number[] = data.daily.temperature_2m_max;
    const mins: number[] = data.daily.temperature_2m_min;
    const codes: number[] = data.daily.weather_code;

    for (let i = 0; i < times.length; i++) {
      const dStr = times[i];
      const meta = getWeatherMeta(codes[i]);
      days[dStr] = {
        date: dStr,
        maxTemp: Math.round(maxes[i]),
        minTemp: Math.round(mins[i]),
        icon: meta.icon,
        description: meta.desc,
      };
    }

    const forecast: WeatherForecast = {
      latitude: lat,
      longitude: lng,
      days,
      updatedAt: new Date().toISOString(),
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(getCacheKey(lat, lng), JSON.stringify(forecast));
      } catch {}
    }

    return forecast;
  } catch (err) {
    console.warn('Weather fetch failed, falling back to cache:', err);
    return cached;
  }
}
