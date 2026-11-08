// Deterministic fixtures for the UI tester (no network). Shapes follow open-meteo /v1/forecast and Nominatim.
function pad(n) { return String(n).padStart(2, '0'); }

export function forecastFixture() {
  const time = [];
  const temperature_2m = [];
  const relative_humidity_2m = [];
  const wind_speed_10m = [];
  const weather_code = [];
  const precipitation_probability = [];
  const precipitation = [];
  const uv_index = [];
  for (let h = 0; h < 72; h++) {
    const day = 8 + Math.floor(h / 24);
    time.push(`2026-11-${pad(day)}T${pad(h % 24)}:00`);
    temperature_2m.push(Math.round((9 + 4 * Math.sin((h - 8) / 24 * 2 * Math.PI)) * 10) / 10);
    relative_humidity_2m.push(70 + (h % 7));
    wind_speed_10m.push(10 + (h % 5));
    weather_code.push(h % 24 < 12 ? 3 : 61);
    precipitation_probability.push((h * 7) % 90);
    precipitation.push(h % 5 === 0 ? 0.4 + (h % 3) * 0.3 : 0);
    uv_index.push(Math.max(0, Math.round(3 * Math.sin((h % 24 - 6) / 12 * Math.PI) * 10) / 10));
  }
  return {
    latitude: 51.5, longitude: -0.12, timezone: 'Europe/London',
    current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h', rain: 'mm', relative_humidity_2m: '%' },
    current: { time: '2026-11-08T09:00', temperature_2m: 9.4, apparent_temperature: 6.8, relative_humidity_2m: 74, is_day: 1, rain: 0, wind_speed_10m: 13.2, weather_code: 3 },
    hourly: { time, temperature_2m, relative_humidity_2m, wind_speed_10m, weather_code, precipitation_probability, precipitation, uv_index },
    daily: { time: ['2026-11-08', '2026-11-09', '2026-11-10'], sunrise: ['2026-11-08T07:05', '2026-11-09T07:07', '2026-11-10T07:08'], sunset: ['2026-11-08T16:21', '2026-11-09T16:19', '2026-11-10T16:18'], uv_index_max: [2.4, 2.1, 2.0] },
  };
}

export const searchFixture = [
  { display_name: 'Paris, Île-de-France, France', name: 'Paris', lat: '48.8566', lon: '2.3522' },
  { display_name: 'Paris, Lamar County, Texas, United States', name: 'Paris', lat: '33.6609', lon: '-95.5555' },
];

export const reverseFixture = { address: { city: 'London', state: 'England', country: 'United Kingdom' } };
