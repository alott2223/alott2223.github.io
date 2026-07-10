#!/usr/bin/env node
/* Deterministic checks for the engine + trainer — no API key, no network. */
'use strict';
const path = require('path');
const pricing = require('./pricing.js');
const { calibrate } = require('./train.js');
const { loadHistory, similar } = require('./lib/history.js');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.01 : tol); }

console.log('QuoteForge pricing engine — self test\n');

// 1. Weight math: 96 in^2 * 0.375" * 0.2836 lb/in^3 * 40 = 408.38 lb
const q = pricing.estimate({
  material: 'a36', quantity: 40, thicknessIn: 0.375, areaSqIn: 96,
  cutLengthIn: 42, holes: 4, weldLengthIn: 18.5, finish: 'powder',
  marginPct: 28, laborRate: 95,
});
ok('material weight computed', approx(q.meta.weightLb, 408.38, 0.5));
ok('has a material line', q.lines.some((l) => /Material/.test(l[0])));
ok('has a welding line', q.lines.some((l) => /Welding/.test(l[0])));
ok('has a powder coat line', q.lines.some((l) => /Powder coat/.test(l[0])));
ok('total = subtotal + margin', approx(q.total, q.subtotal + q.margin));
ok('margin is 28% of subtotal', approx(q.margin, q.subtotal * 0.28, 0.02));
ok('confidence in range', q.confidence >= 82 && q.confidence <= 96);

// 2. Stainless welds cost more than mild for the same length
const mild = pricing.estimate({ material: 'a36',  quantity: 1, thicknessIn: 0.25, areaSqIn: 50, weldLengthIn: 30 });
const ss   = pricing.estimate({ material: 'ss304', quantity: 1, thicknessIn: 0.25, areaSqIn: 50, weldLengthIn: 30 });
const mildWeld = mild.lines.find((l) => /Welding/.test(l[0]))[1];
const ssWeld   = ss.lines.find((l) => /Welding/.test(l[0]))[1];
ok('stainless weld costs more than mild', ssWeld > mildWeld);

// 3. More quantity → higher total
const q1 = pricing.estimate({ material: 'al5052', quantity: 1,  thicknessIn: 0.09, areaSqIn: 40 });
const q2 = pricing.estimate({ material: 'al5052', quantity: 10, thicknessIn: 0.09, areaSqIn: 40 });
ok('10x quantity raises total', q2.total > q1.total);

// 4. Validation rejects bad input
let threw = false;
try { pricing.estimate({ material: 'unobtanium', quantity: 1, thicknessIn: 1, areaSqIn: 1 }); }
catch (e) { threw = true; }
ok('rejects unknown material', threw);

threw = false;
try { pricing.estimate({ material: 'a36', quantity: 0, thicknessIn: 1, areaSqIn: 1 }); }
catch (e) { threw = true; }
ok('rejects zero quantity', threw);

// 5. estimate() honors a calibrated config (learned labor rate raises cost)
const base = pricing.estimate({ material: 'a36', quantity: 1, thicknessIn: 0.25, areaSqIn: 50, weldLengthIn: 30 });
const cfg  = pricing.estimate({ material: 'a36', quantity: 1, thicknessIn: 0.25, areaSqIn: 50, weldLengthIn: 30 },
  { defaults: { laborRate: 130 } });
ok('config laborRate raises labor lines', cfg.total > base.total);
const cheapMat = pricing.estimate({ material: 'a36', quantity: 1, thicknessIn: 0.25, areaSqIn: 50 },
  { materialPrices: { a36: 0.40 } });
const dearMat  = pricing.estimate({ material: 'a36', quantity: 1, thicknessIn: 0.25, areaSqIn: 50 },
  { materialPrices: { a36: 1.00 } });
ok('config materialPrices changes material cost', dearMat.total > cheapMat.total);

// 6. Trainer recovers the hidden TRUE rates from data/gen-sample.js
const history = loadHistory(path.join(__dirname, 'data', 'history.sample.jsonl'));
ok('history loaded', history.length >= 40);
const c = calibrate(history);
const within = (v, target, tolPct) => Math.abs(v - target) <= target * tolPct;
ok('recovers laser rate ~26 in/min',   within(c.rates.laserInPerMin, 26, 0.10));
ok('recovers drill ~24 sec/hole',       within(c.rates.drillSecPerHole, 24, 0.10));
ok('recovers weld ~3.0 in/min',         within(c.rates.weldInPerMin, 3.0, 0.10));
ok('recovers stainless factor ~0.65',   Math.abs(c.rates.ssWeldFactor - 0.65) <= 0.08);
ok('recovers bend ~27 sec/bend',        within(c.rates.bendSecPerBend, 27, 0.10));
ok('recovers labor ~$98/hr',            Math.abs(c.defaults.laborRate - 98) <= 3);
ok('recommends a sane margin',          c.recommendedMargin >= 22 && c.recommendedMargin <= 34);
ok('margin analysis covers buckets',    c.marginAnalysis.length >= 5);

// 7. Similar-job matching finds re-order clusters
const reorder = history.find((j) => /re-order/.test(j.partName || ''));
const sim = similar(reorder, history, 3);
ok('re-order finds a close match',      sim.count >= 1);
ok('top match scores high',             sim.matches[0].score >= 90);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
