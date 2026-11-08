// CLIME data layer. Plain ES module, no build step.
export const DEFAULT_PLACE = Object.freeze({
  name: 'London',
  label: 'London, England, United Kingdom',
  latitude: 51.5074,
  longitude: -0.1278,
});

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

let weatherCodes = null; // code -> description
let codesLoading = null;

export function setWeatherCodes(obj) {
  const map = {};
  const list = Array.isArray(obj) ? obj : obj && obj.weather_codes;
  if (Array.isArray(list)) {
    for (const e of list) if (e && e.code !== undefined) map[e.code] = e.description;
  } else if (obj && typeof obj === 'object') {
    Object.assign(map, obj);
  }
  weatherCodes = map;
}

export function describeCode(code) {
  const d = weatherCodes && weatherCodes[code];
  return typeof d === 'string' && d ? d : 'Unknown';
}

async function ensureCodes() {
  if (weatherCodes || typeof globalThis.fetch !== 'function') return;
  codesLoading ||= globalThis.fetch('weather_codes.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) setWeatherCodes(j); })
    .catch(() => {})
    .finally(() => { codesLoading = null; });
  await codesLoading;
}

async function getJson(url, what, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url);
  } catch {
    throw new Error(`Network problem while loading ${what}. Check your connection and try again.`);
  }
  if (!res || !res.ok) {
    throw new Error(`Could not load ${what} (HTTP ${res ? res.status : 'error'}). Please try again.`);
  }
  return res.json();
}

export async function searchPlaces(query, fetchImpl = globalThis.fetch) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return [];
  const data = await getJson(
    `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6`,
    'place search', fetchImpl);
  if (!Array.isArray(data)) return [];
  return data
    .map((p) => {
      const label = String(p.display_name || '');
      return {
        label,
        name: p.name || label.split(',')[0].trim(),
        latitude: Number(p.lat),
        longitude: Number(p.lon),
      };
    })
    .filter((p) => p.label && Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
}

export async function reverseGeocode(lat, lon, fetchImpl = globalThis.fetch) {
  const coords = `Lat ${Number(lat).toFixed(2)}, Lon ${Number(lon).toFixed(2)}`;
  try {
    const data = await getJson(
      `${NOMINATIM}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=jsonv2`,
      'location name', fetchImpl);
    const a = (data && data.address) || {};
    const name = a.city || a.town || a.village || a.county;
    if (!name) return { name: coords, label: coords };
    const label = [name, a.state, a.country].filter(Boolean).join(', ');
    return { name, label };
  } catch {
    return { name: coords, label: coords };
  }
}

export async function getForecast(lat, lon, fetchImpl = globalThis.fetch) {
  const params = [
    `latitude=${encodeURIComponent(lat)}`,
    `longitude=${encodeURIComponent(lon)}`,
    'current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,rain,wind_speed_10m,weather_code',
    'hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability,precipitation,uv_index',
    'daily=sunrise,sunset,uv_index_max',
    'timezone=auto',
    'forecast_days=3',
  ].join('&');
  const [d] = await Promise.all([getJson(`${OPEN_METEO}?${params}`, 'the weather forecast', fetchImpl), ensureCodes()]);

  const c = d.current || {};
  const u = d.current_units || {};
  const h = d.hourly || {};
  const times = h.time || [];
  const curHour = String(c.time || '').slice(0, 13);
  let start = curHour ? times.findIndex((t) => t.slice(0, 13) >= curHour) : 0;
  if (start < 0) start = times.length;
  const idx = times.map((_, i) => i).slice(start);

  const hourly = idx.slice(0, 48).map((i) => ({
    time: times[i],
    temperature: h.temperature_2m?.[i],
    humidity: h.relative_humidity_2m?.[i],
    windSpeed: h.wind_speed_10m?.[i],
    code: h.weather_code?.[i],
    description: describeCode(h.weather_code?.[i]),
    precipProbability: h.precipitation_probability?.[i],
    precipitation: h.precipitation?.[i],
  }));
  const next24Rain = hourly.slice(0, 24).map(({ time, precipProbability, precipitation }) => ({ time, precipProbability, precipitation }));

  return {
    timezone: d.timezone,
    current: {
      time: c.time,
      temperature: c.temperature_2m,
      apparent: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      windSpeed: c.wind_speed_10m,
      rain: c.rain,
      isDay: c.is_day === 1,
      code: c.weather_code,
      description: describeCode(c.weather_code),
      units: {
        temperature: u.temperature_2m,
        wind: u.wind_speed_10m,
        rain: u.rain,
        humidity: u.relative_humidity_2m,
      },
    },
    daily: {
      sunrise: d.daily?.sunrise?.[0],
      sunset: d.daily?.sunset?.[0],
      uvIndexMax: d.daily?.uv_index_max?.[0],
    },
    hourly,
    next24Rain,
  };
}

export function resolveStartPlace({
  geolocation = globalThis.navigator?.geolocation,
  timeoutMs = 4000,
} = {}) {
  const fallback = { latitude: DEFAULT_PLACE.latitude, longitude: DEFAULT_PLACE.longitude, source: 'default' };
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => finish(fallback), timeoutMs);
    if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') return finish(fallback);
    try {
      geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos?.coords || {};
          finish(Number.isFinite(latitude) && Number.isFinite(longitude)
            ? { latitude, longitude, source: 'geolocation' } : fallback);
        },
        () => finish(fallback),
        { timeout: timeoutMs, maximumAge: 600000 },
      );
    } catch {
      finish(fallback);
    }
  });
}
