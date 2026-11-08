import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLACE, searchPlaces, reverseGeocode, getForecast,
  describeCode, setWeatherCodes, resolveStartPlace,
} from '../js/api.js';

const okJson = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const recorder = (body) => {
  const calls = [];
  const f = async (url, opts) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => body }; };
  f.calls = calls;
  return f;
};
const failing = (status = 500) => async () => ({ ok: false, status, json: async () => ({}) });

test('searchPlaces: no countrycodes, encodes query, jsonv2, limit=6', async () => {
  const f = recorder([{ display_name: 'Paris, France', name: 'Paris', lat: '48.85', lon: '2.35' }]);
  const res = await searchPlaces('São Paulo & co', f);
  assert.equal(f.calls.length, 1);
  const u = f.calls[0];
  assert.ok(u.startsWith('https://nominatim.openstreetmap.org/search?'));
  assert.ok(!u.includes('countrycodes'));
  assert.ok(u.includes('q=' + encodeURIComponent('São Paulo & co')));
  assert.ok(u.includes('format=jsonv2'));
  assert.ok(u.includes('limit=6'));
  assert.deepEqual(res, [{ label: 'Paris, France', name: 'Paris', latitude: 48.85, longitude: 2.35 }]);
});

test('searchPlaces: blank/undefined query -> [] with no fetch', async () => {
  const f = recorder([]);
  assert.deepEqual(await searchPlaces('', f), []);
  assert.deepEqual(await searchPlaces('   ', f), []);
  assert.deepEqual(await searchPlaces(undefined, f), []);
  assert.equal(f.calls.length, 0);
});

test('searchPlaces: HTTP error throws', async () => {
  await assert.rejects(() => searchPlaces('x', failing(503)), /503|search/i);
});

test('searchPlaces: name falls back to first label part', async () => {
  const f = recorder([{ display_name: 'Leeds, England, UK', lat: '1', lon: '2' }]);
  const [p] = await searchPlaces('leeds', f);
  assert.equal(p.name, 'Leeds');
});

test('reverseGeocode: city, town, village, county fallbacks', async () => {
  const mk = (address) => okJson({ address });
  let r = await reverseGeocode(1, 2, mk({ city: 'Pune', state: 'MH', country: 'India' }));
  assert.deepEqual(r, { name: 'Pune', label: 'Pune, MH, India' });
  r = await reverseGeocode(1, 2, mk({ town: 'Ooty', country: 'India' }));
  assert.equal(r.name, 'Ooty');
  r = await reverseGeocode(1, 2, mk({ village: 'Hamlet', country: 'X' }));
  assert.equal(r.name, 'Hamlet');
  r = await reverseGeocode(1, 2, mk({ county: 'Kent', country: 'UK' }));
  assert.equal(r.name, 'Kent');
});

test('reverseGeocode: never returns Not Found/Error; falls back to coords', async () => {
  for (const f of [okJson({ error: 'Unable to geocode' }), okJson({ address: {} }), failing(500), async () => { throw new Error('net'); }]) {
    const r = await reverseGeocode(12.5, -3.25, f);
    assert.equal(r.name, 'Lat 12.50, Lon -3.25');
    assert.equal(r.label, r.name);
    assert.ok(!/not found|error/i.test(r.name + r.label));
  }
});

const hours = (start, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2025, 0, 1, 0, 0) + (start + i) * 3600e3);
  return d.toISOString().slice(0, 13) + ':00';
});
function apiBody(n = 72) {
  const time = hours(0, n);
  return {
    timezone: 'Europe/London',
    current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h', rain: 'mm', relative_humidity_2m: '%' },
    current: { time: '2025-01-01T05:15', temperature_2m: 3.1, apparent_temperature: 0.4, relative_humidity_2m: 80, is_day: 0, rain: 0.2, wind_speed_10m: 12, weather_code: 61 },
    hourly: {
      time,
      temperature_2m: time.map((_, i) => i),
      relative_humidity_2m: time.map((_, i) => 50 + i),
      wind_speed_10m: time.map((_, i) => i / 2),
      weather_code: time.map(() => 3),
      precipitation_probability: time.map((_, i) => i),
      precipitation: time.map((_, i) => i / 10),
      uv_index: time.map(() => 1),
    },
    daily: { sunrise: ['2025-01-01T08:00', '2025-01-02T08:00'], sunset: ['2025-01-01T16:00', '2025-01-02T16:01'], uv_index_max: [1.5, 2] },
  };
}

test('getForecast: URL query and normalization', async () => {
  setWeatherCodes({ weather_codes: [{ code: 61, description: 'Slight Rain' }, { code: 3, description: 'Overcast' }] });
  const f = recorder(apiBody());
  const r = await getForecast(51.5, -0.12, f);
  const u = f.calls[0];
  assert.ok(u.startsWith('https://api.open-meteo.com/v1/forecast?'));
  assert.ok(u.includes('timezone=auto'));
  assert.ok(u.includes('forecast_days=3'));
  assert.ok(u.includes('apparent_temperature'));
  assert.ok(u.includes('uv_index_max'));
  assert.equal(r.timezone, 'Europe/London');
  assert.deepEqual(r.current, {
    time: '2025-01-01T05:15', temperature: 3.1, apparent: 0.4, humidity: 80, windSpeed: 12, rain: 0.2,
    isDay: false, code: 61, description: 'Slight Rain',
    units: { temperature: '°C', wind: 'km/h', rain: 'mm', humidity: '%' },
  });
  assert.deepEqual(r.daily, { sunrise: '2025-01-01T08:00', sunset: '2025-01-01T16:00', uvIndexMax: 1.5 });
  assert.equal(r.hourly.length, 48);
  assert.deepEqual(r.hourly[0], { time: '2025-01-01T05:00', temperature: 5, humidity: 55, windSpeed: 2.5, code: 3, description: 'Overcast', precipProbability: 5, precipitation: 0.5 });
  assert.equal(r.next24Rain.length, 24);
  assert.deepEqual(r.next24Rain[0], { time: '2025-01-01T05:00', precipProbability: 5, precipitation: 0.5 });
  assert.equal(r.next24Rain[23].time, '2025-01-02T04:00');
});

test('getForecast: fewer than 24 only if API gives fewer', async () => {
  const r = await getForecast(0, 0, recorder(apiBody(10)));
  assert.equal(r.next24Rain.length, 5);
  assert.equal(r.hourly.length, 5);
});

test('getForecast: HTTP error and network error throw', async () => {
  await assert.rejects(() => getForecast(0, 0, failing(500)), Error);
  await assert.rejects(() => getForecast(0, 0, async () => { throw new TypeError('offline'); }), /network|offline|weather/i);
});

test('describeCode: known, unknown, non-number', () => {
  setWeatherCodes({ weather_codes: [{ code: 0, description: 'Clear Sky' }] });
  assert.equal(describeCode(0), 'Clear Sky');
  assert.equal(describeCode(999), 'Unknown');
  assert.equal(describeCode(undefined), 'Unknown');
});

test('resolveStartPlace: success, denied, timeout, missing, throwing', async () => {
  const ok = { getCurrentPosition: (s) => s({ coords: { latitude: 10, longitude: 20 } }) };
  assert.deepEqual(await resolveStartPlace({ geolocation: ok }), { latitude: 10, longitude: 20, source: 'geolocation' });
  const def = { latitude: DEFAULT_PLACE.latitude, longitude: DEFAULT_PLACE.longitude, source: 'default' };
  const denied = { getCurrentPosition: (_s, e) => e({ code: 1 }) };
  assert.deepEqual(await resolveStartPlace({ geolocation: denied }), def);
  const hang = { getCurrentPosition: () => {} };
  const t0 = Date.now();
  assert.deepEqual(await resolveStartPlace({ geolocation: hang, timeoutMs: 30 }), def);
  assert.ok(Date.now() - t0 < 1000);
  assert.deepEqual(await resolveStartPlace({ geolocation: null }), def);
  const boom = { getCurrentPosition: () => { throw new Error('x'); } };
  assert.deepEqual(await resolveStartPlace({ geolocation: boom }), def);
});

test('DEFAULT_PLACE matches contract', () => {
  assert.deepEqual(DEFAULT_PLACE, { name: 'London', label: 'London, England, United Kingdom', latitude: 51.5074, longitude: -0.1278 });
});
