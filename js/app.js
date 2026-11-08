import { DEFAULT_PLACE, searchPlaces, reverseGeocode, getForecast, resolveStartPlace } from './api.js';
import { renderRainChart } from './chart.js';

const $ = (id) => document.getElementById(id);
const els = {
  input: $('search-input'), form: $('search-form'), list: $('suggestions'),
  select: $('location'), pin: $('pin'), unpin: $('unpin'), locate: $('locate'),
  loading: $('loading'), error: $('error'), errorMsg: $('error-message'), retry: $('retry'),
  content: $('content'), status: $('status'),
};

const state = { place: null, pinned: new Map(), reqId: 0, suggestions: [], active: -1 };

/* ---------- pure helpers (exported for tests) ---------- */
export function uvLevel(uv) {
  const v = Number(uv);
  if (!Number.isFinite(v)) return { label: 'Unknown', key: 'unknown' };
  if (v < 3) return { label: 'Low', key: 'low' };
  if (v < 6) return { label: 'Moderate', key: 'moderate' };
  if (v < 8) return { label: 'High', key: 'high' };
  if (v < 11) return { label: 'Very high', key: 'very-high' };
  return { label: 'Extreme', key: 'extreme' };
}

// ISO local string ("2026-11-07T14:30") -> pieces, formatted without any timezone conversion
// (the API already returns times in the place's own timezone).
function parseLocal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso ?? ''));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)));
}
export function formatClock(iso) {
  const d = parseLocal(iso);
  return d ? d.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '–';
}
export function formatDateTime(iso) {
  const d = parseLocal(iso);
  return d ? d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + formatClock(iso) : '–';
}
const val = (v, unit = '') => (v === null || v === undefined || Number.isNaN(v) ? '–' : `${v}${unit}`);

/* ---------- UI state ---------- */
function setStatus(msg) { els.status.textContent = msg; }
function showLoading(name) {
  els.error.hidden = true; els.content.hidden = true; els.loading.hidden = false;
  setStatus(`Loading weather for ${name}…`);
}
function showError(msg) {
  els.loading.hidden = true; els.content.hidden = true; els.error.hidden = false;
  els.errorMsg.textContent = msg;
  els.retry.focus();
}
function showContent() { els.loading.hidden = true; els.error.hidden = true; els.content.hidden = false; }

/* ---------- rendering ---------- */
function render(place, f) {
  const c = f.current;
  const u = c.units || {};
  $('loc').textContent = place.label || place.name;
  $('local-time').textContent = formatDateTime(c.time);
  $('local-time').setAttribute('datetime', c.time);
  $('tz').textContent = f.timezone ? `(${f.timezone})` : '';
  $('temperature').textContent = val(c.temperature, u.temperature);
  $('weather-desc').textContent = c.description || '';
  $('apparent').textContent = val(c.apparent, u.temperature);
  $('revh').textContent = val(c.humidity, u.humidity);
  $('wind').textContent = val(c.windSpeed, ` ${u.wind || ''}`.trimEnd());
  $('rain').textContent = val(c.rain, ` ${u.rain || ''}`.trimEnd());
  $('sunrise').textContent = formatClock(f.daily?.sunrise);
  $('sunset').textContent = formatClock(f.daily?.sunset);
  const uv = f.daily?.uvIndexMax;
  const lvl = uvLevel(uv);
  $('uv').textContent = val(uv);
  const badge = $('uv-level');
  badge.textContent = lvl.label;
  badge.dataset.level = lvl.key;

  renderRainChart($('rain-chart'), f.next24Rain);

  const body = $('hourly-body');
  body.textContent = '';
  (f.hourly || []).slice(0, 24).forEach((h) => {
    const tr = body.insertRow();
    [formatClock(h.time), val(h.temperature, u.temperature), val(h.humidity, u.humidity),
     val(h.windSpeed, ` ${u.wind || ''}`.trimEnd()), val(h.precipProbability, '%'), h.description || '']
      .forEach((t) => { tr.insertCell().textContent = t; });
  });
  showContent();
  setStatus(`Weather updated for ${place.label || place.name}.`);
}

function refreshPlaces() {
  const cur = state.place;
  els.select.textContent = '';
  const add = (key, text) => { const o = document.createElement('option'); o.value = key; o.textContent = text; els.select.appendChild(o); };
  if (cur) add(keyOf(cur), cur.name);
  state.pinned.forEach((p, k) => { if (!cur || k !== keyOf(cur)) add(k, p.name); });
  if (cur) els.select.value = keyOf(cur);
  const isPinned = !!cur && state.pinned.has(keyOf(cur));
  els.pin.hidden = isPinned;
  els.unpin.hidden = !isPinned;
}
const keyOf = (p) => `${Number(p.latitude).toFixed(3)},${Number(p.longitude).toFixed(3)}`;

/* ---------- loading ---------- */
async function loadPlace(place) {
  const id = ++state.reqId;
  state.place = place;
  refreshPlaces();
  showLoading(place.name);
  try {
    const f = await getForecast(place.latitude, place.longitude);
    if (id !== state.reqId) return;
    render(place, f);
  } catch (err) {
    if (id !== state.reqId) return;
    showError(`Could not load the weather: ${err?.message || 'unknown error'}`);
    setStatus('Could not load the weather.');
  }
}

async function loadCoords(latitude, longitude) {
  const id = ++state.reqId;
  showLoading('your location');
  let place;
  try {
    const g = await reverseGeocode(latitude, longitude);
    place = { name: g.name, label: g.label, latitude, longitude };
  } catch {
    place = { name: `${(+latitude).toFixed(2)}, ${(+longitude).toFixed(2)}`, label: `Lat ${(+latitude).toFixed(2)}, Lon ${(+longitude).toFixed(2)}`, latitude, longitude };
  }
  if (id !== state.reqId) return; // superseded
  return loadPlace(place);
}

async function start() {
  showLoading('your location');
  const s = await resolveStartPlace();
  if (s.source === 'default') return loadPlace({ ...DEFAULT_PLACE });
  return loadCoords(s.latitude, s.longitude);
}

/* ---------- search / combobox ---------- */
let debounceTimer; let searchSeq = 0;
function closeList() {
  els.list.hidden = true; els.list.textContent = '';
  els.input.setAttribute('aria-expanded', 'false'); els.input.removeAttribute('aria-activedescendant');
  state.suggestions = []; state.active = -1;
}
function setActive(i) {
  state.active = i;
  [...els.list.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
  if (i >= 0) { els.input.setAttribute('aria-activedescendant', `sugg-${i}`); els.list.children[i].scrollIntoView({ block: 'nearest' }); }
  else els.input.removeAttribute('aria-activedescendant');
}
function showSuggestions(items, message) {
  els.list.textContent = '';
  state.suggestions = items;
  state.active = -1;
  if (message) {
    const li = document.createElement('li'); li.className = 'empty'; li.setAttribute('role', 'option'); li.setAttribute('aria-disabled', 'true'); li.textContent = message; els.list.appendChild(li);
  }
  items.forEach((p, i) => {
    const li = document.createElement('li'); li.id = `sugg-${i}`; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false'); li.textContent = p.label;
    li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
    els.list.appendChild(li);
  });
  els.list.hidden = false;
  els.input.setAttribute('aria-expanded', 'true');
}
async function runSearch(query) {
  const seq = ++searchSeq;
  try {
    const items = await searchPlaces(query);
    if (seq !== searchSeq) return;
    showSuggestions(items, items.length ? '' : 'No places found');
    setStatus(items.length ? `${items.length} suggestions available` : 'No places found');
  } catch (err) {
    if (seq !== searchSeq) return;
    showSuggestions([], `Search failed: ${err?.message || 'network error'}`);
  }
}
function choose(i) {
  const p = state.suggestions[i];
  if (!p) return;
  els.input.value = '';
  closeList();
  loadPlace({ name: p.name, label: p.label, latitude: p.latitude, longitude: p.longitude });
}

els.input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = els.input.value.trim();
  if (!q) { searchSeq++; closeList(); return; }
  debounceTimer = setTimeout(() => runSearch(q), 350);
});
els.input.addEventListener('keydown', (e) => {
  const n = state.suggestions.length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive((state.active + 1) % n); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive(state.active <= 0 ? n - 1 : state.active - 1); }
  else if (e.key === 'Escape') { closeList(); }
  else if (e.key === 'Enter' && state.active >= 0) { e.preventDefault(); choose(state.active); }
});
els.input.addEventListener('blur', () => setTimeout(closeList, 120));
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearTimeout(debounceTimer);
  if (state.active >= 0) return choose(state.active);
  const q = els.input.value.trim();
  if (!q) return;
  try {
    const items = await searchPlaces(q);
    if (items.length === 1) { state.suggestions = items; return choose(0); }
    showSuggestions(items, items.length ? '' : 'No places found');
  } catch (err) {
    showSuggestions([], `Search failed: ${err?.message || 'network error'}`);
  }
});

/* ---------- pin / places / retry ---------- */
els.pin.addEventListener('click', () => {
  if (!state.place) return;
  state.pinned.set(keyOf(state.place), { ...state.place });
  refreshPlaces();
  setStatus(`${state.place.name} pinned.`);
  els.unpin.focus();
});
els.unpin.addEventListener('click', () => {
  if (!state.place) return;
  state.pinned.delete(keyOf(state.place));
  refreshPlaces();
  setStatus(`${state.place.name} unpinned.`);
  els.pin.focus();
});
els.select.addEventListener('change', () => {
  const p = state.pinned.get(els.select.value);
  if (p) loadPlace({ ...p });
  else refreshPlaces();
});
els.retry.addEventListener('click', () => (state.place ? loadPlace(state.place) : start()));
els.locate.addEventListener('click', async () => {
  showLoading('your location');
  const s = await resolveStartPlace();
  if (s.source === 'geolocation') loadCoords(s.latitude, s.longitude);
  else if (state.place) { loadPlace(state.place); setStatus('Location unavailable; showing the current place.'); }
  else loadPlace({ ...DEFAULT_PLACE });
});

if (typeof document !== 'undefined' && document.getElementById('search-input')) start();
