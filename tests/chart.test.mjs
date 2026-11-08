import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartModel, renderRainChart } from '../js/chart.js';

const mk = (n) => Array.from({ length: n }, (_, i) => ({ time: `2026-11-07T${String(i % 24).padStart(2, '0')}:00`, precipProbability: (i * 7) % 130, precipitation: i % 5 === 0 ? 2.5 : 0 }));

test('chart: 24 entries', () => {
  const m = buildChartModel(mk(24));
  assert.equal(m.empty, false); assert.equal(m.bars.length, 24); assert.equal(m.points.length, 24);
  assert.ok(m.line.startsWith('M')); assert.match(m.summary, /next 24 hours/);
  for (const b of m.bars) { assert.ok(b.height >= 0 && b.y >= 0 && b.x >= 0 && b.x + b.width <= m.width); assert.ok(b.probability <= 100); }
});
test('chart: <24 entries', () => {
  const m = buildChartModel(mk(5));
  assert.equal(m.bars.length, 5); assert.match(m.summary, /next 5 hours/);
});
test('chart: empty / null / undefined / non-array', () => {
  for (const x of [[], null, undefined, 'x']) { const m = buildChartModel(x); assert.equal(m.empty, true); assert.equal(m.bars.length, 0); assert.equal(m.line, ''); }
});
test('chart: missing/NaN/negative values do not yield NaN', () => {
  const m = buildChartModel([{ time: 't' }, { time: null, precipProbability: 'abc', precipitation: -3 }, { time: 'x', precipProbability: null, precipitation: undefined }]);
  assert.ok(!/NaN|undefined/.test(JSON.stringify(m)), JSON.stringify(m));
});
test('chart: renderRainChart escapes time and has no NaN', () => {
  const el = { innerHTML: '' };
  renderRainChart(el, [{ time: '<img onerror=x>', precipProbability: 50, precipitation: 1 }]);
  assert.ok(!el.innerHTML.includes('<img'));
  assert.ok(!/NaN/.test(el.innerHTML));
  renderRainChart(el, []); assert.match(el.innerHTML, /No rain data/);
});
