// Rain chart: pure model builder + inline-SVG renderer (no chart library).
export const CHART = { width: 720, height: 240, left: 40, right: 12, top: 16, bottom: 32 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Pure: next24Rain [{time, precipProbability, precipitation}] ->
 * {bars:[{x,y,width,height,time,precipitation,probability}], line:'M..L..', points:[[x,y]],
 *  maxPrecip, summary, width, height, empty}
 * Bars = precipitation (mm), scaled to max(1, maxPrecip); line = probability 0-100%.
 */
export function buildChartModel(next24Rain) {
  const data = Array.isArray(next24Rain) ? next24Rain : [];
  const { width, height, left, right, top, bottom } = CHART;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  if (data.length === 0) {
    return { bars: [], line: '', points: [], maxPrecip: 0, summary: 'No rain data available.', width, height, empty: true };
  }
  const maxPrecip = Math.max(1, ...data.map((d) => num(d.precipitation)));
  const slot = plotW / data.length;
  const barW = Math.max(2, slot * 0.7);
  const bars = [];
  const points = [];
  data.forEach((d, i) => {
    const precipitation = Math.max(0, num(d.precipitation));
    const probability = clamp(num(d.precipProbability), 0, 100);
    const h = (precipitation / maxPrecip) * plotH;
    const cx = left + slot * i + slot / 2;
    bars.push({ x: round(cx - barW / 2), y: round(top + plotH - h), width: round(barW), height: round(h), time: d.time, precipitation, probability });
    points.push([round(cx), round(top + plotH - (probability / 100) * plotH)]);
  });
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const total = bars.reduce((s, b) => s + b.precipitation, 0);
  const peak = bars.reduce((a, b) => (b.probability > a.probability ? b : a), bars[0]);
  const summary = `Rain over the next ${data.length} hours: ${round(total)} mm in total; highest chance ${Math.round(peak.probability)}% at ${hourLabel(peak.time)}.`;
  return { bars, line, points, maxPrecip, summary, width, height, empty: false };
}

function round(n) { return Math.round(n * 10) / 10; }
function hourLabel(t) { return typeof t === 'string' && t.length >= 16 ? t.slice(11, 16) : String(t ?? ''); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderRainChart(containerEl, next24Rain) {
  const m = buildChartModel(next24Rain);
  const { left, top, bottom, height, width, right } = CHART;
  const baseY = height - bottom;
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(m.summary)}" preserveAspectRatio="xMidYMid meet">`;
  svg += `<title>${esc(m.summary)}</title>`;
  [0, 50, 100].forEach((p) => {
    const y = round(baseY - (p / 100) * (baseY - top));
    svg += `<line class="axis" x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/><text x="${left - 6}" y="${y + 4}" text-anchor="end">${p}%</text>`;
  });
  m.bars.forEach((b, i) => {
    svg += `<rect class="bar" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"/>`;
    if (i % 3 === 0) svg += `<text x="${round(b.x + b.width / 2)}" y="${height - 10}" text-anchor="middle">${esc(hourLabel(b.time))}</text>`;
  });
  if (m.line) svg += `<path class="prob" d="${m.line}"/>`;
  svg += '</svg>';
  const legend = '<p class="chart-legend" aria-hidden="true"><span>Bars: rain (mm), max ' + round(m.maxPrecip) + ' mm</span><span>Line: chance of rain (%)</span></p>';
  let table = '<table class="visually-hidden"><caption>Rain forecast by hour</caption><thead><tr><th scope="col">Time</th><th scope="col">Chance of rain</th><th scope="col">Rain (mm)</th></tr></thead><tbody>';
  m.bars.forEach((b) => { table += `<tr><td>${esc(hourLabel(b.time))}</td><td>${Math.round(b.probability)}%</td><td>${b.precipitation}</td></tr>`; });
  table += '</tbody></table>';
  containerEl.innerHTML = m.empty ? `<p class="muted">${esc(m.summary)}</p>` : svg + legend + table;
  return m;
}
