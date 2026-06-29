/**
 * Bundled, offline airport / time-zone dataset.
 *
 * Curated list of major commercial airports used by the flights page so that
 * IATA codes resolve to a city + IANA time zone with **no network** – durations
 * and layovers stay correct anywhere (see `docs/10-page-flights.md`).
 *
 * Coverage: ~150 of the busiest international airports across every region
 * (Europe, North & South America, Middle East, Africa, Asia, Oceania). This is
 * deliberately a curated subset, not the full ~9,000-airport database, to keep
 * the precached payload small (a few KB). Users can still enter an unknown code
 * manually (the flights UI offers a "my airports" fallback).
 *
 * Fields per record: `code` (IATA), `name`, `city`, `country`, `tz` (IANA).
 * Source: public-domain data derived from OurAirports (https://ourairports.com)
 * and the IANA tz database. `lat`/`lng` are intentionally omitted to stay lean;
 * the schema marks them optional should a richer dataset be swapped in later.
 *
 * This module is the heavy data; it is loaded lazily via `airports.ts` so it is
 * code-split into its own chunk (precached with the app shell, fetched on first
 * airport lookup) rather than bloating the initial bundle.
 */

import type { AirportRecord } from './airports';

/** Compact `[code, name, city, country, tz]` tuples, expanded below. */
type Row = [code: string, name: string, city: string, country: string, tz: string];

const ROWS: Row[] = [
  // --- Europe ---
  ['LHR', 'Heathrow', 'London', 'United Kingdom', 'Europe/London'],
  ['LGW', 'Gatwick', 'London', 'United Kingdom', 'Europe/London'],
  ['STN', 'Stansted', 'London', 'United Kingdom', 'Europe/London'],
  ['MAN', 'Manchester', 'Manchester', 'United Kingdom', 'Europe/London'],
  ['EDI', 'Edinburgh', 'Edinburgh', 'United Kingdom', 'Europe/London'],
  ['DUB', 'Dublin', 'Dublin', 'Ireland', 'Europe/Dublin'],
  ['CDG', 'Charles de Gaulle', 'Paris', 'France', 'Europe/Paris'],
  ['ORY', 'Orly', 'Paris', 'France', 'Europe/Paris'],
  ['NCE', 'Côte d\'Azur', 'Nice', 'France', 'Europe/Paris'],
  ['LYS', 'Saint-Exupéry', 'Lyon', 'France', 'Europe/Paris'],
  ['AMS', 'Schiphol', 'Amsterdam', 'Netherlands', 'Europe/Amsterdam'],
  ['BRU', 'Brussels', 'Brussels', 'Belgium', 'Europe/Brussels'],
  ['FRA', 'Frankfurt', 'Frankfurt', 'Germany', 'Europe/Berlin'],
  ['MUC', 'Munich', 'Munich', 'Germany', 'Europe/Berlin'],
  ['BER', 'Brandenburg', 'Berlin', 'Germany', 'Europe/Berlin'],
  ['HAM', 'Hamburg', 'Hamburg', 'Germany', 'Europe/Berlin'],
  ['DUS', 'Dusseldorf', 'Dusseldorf', 'Germany', 'Europe/Berlin'],
  ['ZRH', 'Zurich', 'Zurich', 'Switzerland', 'Europe/Zurich'],
  ['GVA', 'Geneva', 'Geneva', 'Switzerland', 'Europe/Zurich'],
  ['VIE', 'Vienna', 'Vienna', 'Austria', 'Europe/Vienna'],
  ['MAD', 'Barajas', 'Madrid', 'Spain', 'Europe/Madrid'],
  ['BCN', 'El Prat', 'Barcelona', 'Spain', 'Europe/Madrid'],
  ['PMI', 'Son Sant Joan', 'Palma de Mallorca', 'Spain', 'Europe/Madrid'],
  ['AGP', 'Costa del Sol', 'Málaga', 'Spain', 'Europe/Madrid'],
  ['LIS', 'Humberto Delgado', 'Lisbon', 'Portugal', 'Europe/Lisbon'],
  ['OPO', 'Francisco Sá Carneiro', 'Porto', 'Portugal', 'Europe/Lisbon'],
  ['FCO', 'Fiumicino', 'Rome', 'Italy', 'Europe/Rome'],
  ['MXP', 'Malpensa', 'Milan', 'Italy', 'Europe/Rome'],
  ['VCE', 'Marco Polo', 'Venice', 'Italy', 'Europe/Rome'],
  ['NAP', 'Naples', 'Naples', 'Italy', 'Europe/Rome'],
  ['ATH', 'Eleftherios Venizelos', 'Athens', 'Greece', 'Europe/Athens'],
  ['IST', 'Istanbul', 'Istanbul', 'Türkiye', 'Europe/Istanbul'],
  ['SAW', 'Sabiha Gökçen', 'Istanbul', 'Türkiye', 'Europe/Istanbul'],
  ['CPH', 'Kastrup', 'Copenhagen', 'Denmark', 'Europe/Copenhagen'],
  ['ARN', 'Arlanda', 'Stockholm', 'Sweden', 'Europe/Stockholm'],
  ['OSL', 'Gardermoen', 'Oslo', 'Norway', 'Europe/Oslo'],
  ['HEL', 'Helsinki-Vantaa', 'Helsinki', 'Finland', 'Europe/Helsinki'],
  ['KEF', 'Keflavik', 'Reykjavík', 'Iceland', 'Atlantic/Reykjavik'],
  ['WAW', 'Chopin', 'Warsaw', 'Poland', 'Europe/Warsaw'],
  ['PRG', 'Václav Havel', 'Prague', 'Czechia', 'Europe/Prague'],
  ['BUD', 'Ferenc Liszt', 'Budapest', 'Hungary', 'Europe/Budapest'],
  ['OTP', 'Henri Coandă', 'Bucharest', 'Romania', 'Europe/Bucharest'],
  ['SVO', 'Sheremetyevo', 'Moscow', 'Russia', 'Europe/Moscow'],
  ['LED', 'Pulkovo', 'Saint Petersburg', 'Russia', 'Europe/Moscow'],

  // --- North America ---
  ['JFK', 'John F. Kennedy', 'New York', 'United States', 'America/New_York'],
  ['EWR', 'Newark Liberty', 'Newark', 'United States', 'America/New_York'],
  ['LGA', 'LaGuardia', 'New York', 'United States', 'America/New_York'],
  ['BOS', 'Logan', 'Boston', 'United States', 'America/New_York'],
  ['IAD', 'Dulles', 'Washington', 'United States', 'America/New_York'],
  ['DCA', 'Reagan National', 'Washington', 'United States', 'America/New_York'],
  ['PHL', 'Philadelphia', 'Philadelphia', 'United States', 'America/New_York'],
  ['ATL', 'Hartsfield-Jackson', 'Atlanta', 'United States', 'America/New_York'],
  ['MIA', 'Miami', 'Miami', 'United States', 'America/New_York'],
  ['MCO', 'Orlando', 'Orlando', 'United States', 'America/New_York'],
  ['FLL', 'Fort Lauderdale-Hollywood', 'Fort Lauderdale', 'United States', 'America/New_York'],
  ['ORD', 'O\'Hare', 'Chicago', 'United States', 'America/Chicago'],
  ['MDW', 'Midway', 'Chicago', 'United States', 'America/Chicago'],
  ['DFW', 'Dallas/Fort Worth', 'Dallas', 'United States', 'America/Chicago'],
  ['IAH', 'George Bush', 'Houston', 'United States', 'America/Chicago'],
  ['MSP', 'Minneapolis-Saint Paul', 'Minneapolis', 'United States', 'America/Chicago'],
  ['DEN', 'Denver', 'Denver', 'United States', 'America/Denver'],
  ['PHX', 'Sky Harbor', 'Phoenix', 'United States', 'America/Phoenix'],
  ['LAS', 'Harry Reid', 'Las Vegas', 'United States', 'America/Los_Angeles'],
  ['LAX', 'Los Angeles', 'Los Angeles', 'United States', 'America/Los_Angeles'],
  ['SFO', 'San Francisco', 'San Francisco', 'United States', 'America/Los_Angeles'],
  ['SAN', 'San Diego', 'San Diego', 'United States', 'America/Los_Angeles'],
  ['SEA', 'Seattle-Tacoma', 'Seattle', 'United States', 'America/Los_Angeles'],
  ['PDX', 'Portland', 'Portland', 'United States', 'America/Los_Angeles'],
  ['HNL', 'Daniel K. Inouye', 'Honolulu', 'United States', 'Pacific/Honolulu'],
  ['YYZ', 'Pearson', 'Toronto', 'Canada', 'America/Toronto'],
  ['YUL', 'Pierre Elliott Trudeau', 'Montréal', 'Canada', 'America/Toronto'],
  ['YVR', 'Vancouver', 'Vancouver', 'Canada', 'America/Vancouver'],
  ['YYC', 'Calgary', 'Calgary', 'Canada', 'America/Edmonton'],
  ['MEX', 'Benito Juárez', 'Mexico City', 'Mexico', 'America/Mexico_City'],
  ['CUN', 'Cancún', 'Cancún', 'Mexico', 'America/Cancun'],
  ['GDL', 'Guadalajara', 'Guadalajara', 'Mexico', 'America/Mexico_City'],

  // --- Central & South America ---
  ['PTY', 'Tocumen', 'Panama City', 'Panama', 'America/Panama'],
  ['BOG', 'El Dorado', 'Bogotá', 'Colombia', 'America/Bogota'],
  ['LIM', 'Jorge Chávez', 'Lima', 'Peru', 'America/Lima'],
  ['SCL', 'Arturo Merino Benítez', 'Santiago', 'Chile', 'America/Santiago'],
  ['EZE', 'Ministro Pistarini', 'Buenos Aires', 'Argentina', 'America/Argentina/Buenos_Aires'],
  ['GRU', 'Guarulhos', 'São Paulo', 'Brazil', 'America/Sao_Paulo'],
  ['GIG', 'Galeão', 'Rio de Janeiro', 'Brazil', 'America/Sao_Paulo'],
  ['BSB', 'Brasília', 'Brasília', 'Brazil', 'America/Sao_Paulo'],

  // --- Middle East & Africa ---
  ['DXB', 'Dubai', 'Dubai', 'United Arab Emirates', 'Asia/Dubai'],
  ['AUH', 'Zayed', 'Abu Dhabi', 'United Arab Emirates', 'Asia/Dubai'],
  ['DOH', 'Hamad', 'Doha', 'Qatar', 'Asia/Qatar'],
  ['RUH', 'King Khalid', 'Riyadh', 'Saudi Arabia', 'Asia/Riyadh'],
  ['JED', 'King Abdulaziz', 'Jeddah', 'Saudi Arabia', 'Asia/Riyadh'],
  ['TLV', 'Ben Gurion', 'Tel Aviv', 'Israel', 'Asia/Jerusalem'],
  ['CAI', 'Cairo', 'Cairo', 'Egypt', 'Africa/Cairo'],
  ['CMN', 'Mohammed V', 'Casablanca', 'Morocco', 'Africa/Casablanca'],
  ['JNB', 'O. R. Tambo', 'Johannesburg', 'South Africa', 'Africa/Johannesburg'],
  ['CPT', 'Cape Town', 'Cape Town', 'South Africa', 'Africa/Johannesburg'],
  ['NBO', 'Jomo Kenyatta', 'Nairobi', 'Kenya', 'Africa/Nairobi'],
  ['ADD', 'Bole', 'Addis Ababa', 'Ethiopia', 'Africa/Addis_Ababa'],
  ['LOS', 'Murtala Muhammed', 'Lagos', 'Nigeria', 'Africa/Lagos'],

  // --- Asia ---
  ['DEL', 'Indira Gandhi', 'Delhi', 'India', 'Asia/Kolkata'],
  ['BOM', 'Chhatrapati Shivaji', 'Mumbai', 'India', 'Asia/Kolkata'],
  ['BLR', 'Kempegowda', 'Bengaluru', 'India', 'Asia/Kolkata'],
  ['MAA', 'Chennai', 'Chennai', 'India', 'Asia/Kolkata'],
  ['HYD', 'Rajiv Gandhi', 'Hyderabad', 'India', 'Asia/Kolkata'],
  ['CCU', 'Netaji Subhas Chandra Bose', 'Kolkata', 'India', 'Asia/Kolkata'],
  ['CMB', 'Bandaranaike', 'Colombo', 'Sri Lanka', 'Asia/Colombo'],
  ['KTM', 'Tribhuvan', 'Kathmandu', 'Nepal', 'Asia/Kathmandu'],
  ['BKK', 'Suvarnabhumi', 'Bangkok', 'Thailand', 'Asia/Bangkok'],
  ['DMK', 'Don Mueang', 'Bangkok', 'Thailand', 'Asia/Bangkok'],
  ['SIN', 'Changi', 'Singapore', 'Singapore', 'Asia/Singapore'],
  ['KUL', 'Kuala Lumpur', 'Kuala Lumpur', 'Malaysia', 'Asia/Kuala_Lumpur'],
  ['CGK', 'Soekarno-Hatta', 'Jakarta', 'Indonesia', 'Asia/Jakarta'],
  ['DPS', 'Ngurah Rai', 'Denpasar', 'Indonesia', 'Asia/Makassar'],
  ['MNL', 'Ninoy Aquino', 'Manila', 'Philippines', 'Asia/Manila'],
  ['HAN', 'Noi Bai', 'Hanoi', 'Vietnam', 'Asia/Ho_Chi_Minh'],
  ['SGN', 'Tan Son Nhat', 'Ho Chi Minh City', 'Vietnam', 'Asia/Ho_Chi_Minh'],
  ['HKG', 'Hong Kong', 'Hong Kong', 'Hong Kong', 'Asia/Hong_Kong'],
  ['TPE', 'Taoyuan', 'Taipei', 'Taiwan', 'Asia/Taipei'],
  ['ICN', 'Incheon', 'Seoul', 'South Korea', 'Asia/Seoul'],
  ['GMP', 'Gimpo', 'Seoul', 'South Korea', 'Asia/Seoul'],
  ['NRT', 'Narita', 'Tokyo', 'Japan', 'Asia/Tokyo'],
  ['HND', 'Haneda', 'Tokyo', 'Japan', 'Asia/Tokyo'],
  ['KIX', 'Kansai', 'Osaka', 'Japan', 'Asia/Tokyo'],
  ['PVG', 'Pudong', 'Shanghai', 'China', 'Asia/Shanghai'],
  ['SHA', 'Hongqiao', 'Shanghai', 'China', 'Asia/Shanghai'],
  ['PEK', 'Capital', 'Beijing', 'China', 'Asia/Shanghai'],
  ['PKX', 'Daxing', 'Beijing', 'China', 'Asia/Shanghai'],
  ['CAN', 'Baiyun', 'Guangzhou', 'China', 'Asia/Shanghai'],
  ['SZX', 'Bao\'an', 'Shenzhen', 'China', 'Asia/Shanghai'],
  ['CTU', 'Tianfu', 'Chengdu', 'China', 'Asia/Shanghai'],
  ['ALA', 'Almaty', 'Almaty', 'Kazakhstan', 'Asia/Almaty'],

  // --- Oceania ---
  ['SYD', 'Kingsford Smith', 'Sydney', 'Australia', 'Australia/Sydney'],
  ['MEL', 'Melbourne', 'Melbourne', 'Australia', 'Australia/Melbourne'],
  ['BNE', 'Brisbane', 'Brisbane', 'Australia', 'Australia/Brisbane'],
  ['PER', 'Perth', 'Perth', 'Australia', 'Australia/Perth'],
  ['ADL', 'Adelaide', 'Adelaide', 'Australia', 'Australia/Adelaide'],
  ['AKL', 'Auckland', 'Auckland', 'New Zealand', 'Pacific/Auckland'],
  ['CHC', 'Christchurch', 'Christchurch', 'New Zealand', 'Pacific/Auckland'],
  ['WLG', 'Wellington', 'Wellington', 'New Zealand', 'Pacific/Auckland'],
  ['NAN', 'Nadi', 'Nadi', 'Fiji', 'Pacific/Fiji']
];

/** The expanded airport dataset. */
export const AIRPORTS: AirportRecord[] = ROWS.map(([code, name, city, country, tz]) => ({
  code,
  name,
  city,
  country,
  tz
}));
