#!/usr/bin/env node
/* Deterministic checks for the pricing engine — no API key, no network. */
'use strict';
const pricing = require('./pricing.js');

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
