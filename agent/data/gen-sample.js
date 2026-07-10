#!/usr/bin/env node
/*
 * Generates a deterministic sample job history (data/history.sample.jsonl).
 *
 * Each record is a job the "shop" actually ran, with the REAL hours it took and
 * whether the quote was won. Hours are produced from hidden TRUE rates (below)
 * plus small deterministic noise — so train.js should recover those rates, and
 * selftest.js can assert it does.
 *
 * The set mixes one-off jobs with "re-orders" (near-duplicate parts) so that
 * similar-job matching has realistic clusters to find.
 *
 * Run: node data/gen-sample.js   (rewrites history.sample.jsonl)
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Hidden ground-truth the shop's real numbers are drawn from.
const TRUE = {
  laserInPerMin: 26,
  drillSecPerHole: 24,
  weldInPerMin: 3.0,     // mild steel
  ssWeldFactor: 0.65,    // stainless travel speed vs mild
  bendSecPerBend: 27,
  laborRate: 98,
};

// Deterministic PRNG (mulberry32) so the dataset is identical every run.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260708);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const noise = (v, pct) => v * (1 + (rand() * 2 - 1) * pct);
const r2 = (n) => Math.round(n * 100) / 100;
const isSS = (m) => m === 'ss304' || m === 'ss316';
const isAl = (m) => m === 'al5052' || m === 'al6061';

const MATERIALS = ['a36', 'a36', 'a36', 'a1011', 'ss304', 'ss316', 'al5052', 'al6061'];
const FINISHES = ['none', 'powder', 'powder', 'zinc', 'passivate', 'anodize'];
const PART_NAMES = [
  'Welded bracket', 'Sheet enclosure', 'Conveyor frame', 'Base plate',
  'Gusset set', 'Mounting rail', 'Hopper panel', 'Skid frame', 'Guard bracket',
];

// Compute the actual hours a spec would take at the TRUE rates (+noise), plus a
// margin and a won/lost outcome (win rate falls as margin rises).
function actualsFor(s) {
  const weldRate = TRUE.weldInPerMin * (isSS(s.material) ? TRUE.ssWeldFactor : 1);
  const marginPct = pick([22, 24, 26, 28, 30, 32, 34]);
  const winProb = Math.max(0.05, Math.min(0.95, 0.95 - 0.045 * (marginPct - 22)));
  return {
    actual: {
      cutHrs: s.cutLengthIn > 0 ? r2(noise((s.cutLengthIn * s.quantity) / TRUE.laserInPerMin / 60, 0.05)) : 0,
      drillHrs: s.holes > 0 ? r2(noise((s.holes * s.quantity * TRUE.drillSecPerHole) / 3600, 0.05)) : 0,
      weldHrs: s.weldLengthIn > 0 ? r2(noise((s.weldLengthIn * s.quantity) / weldRate / 60, 0.05)) : 0,
      bendHrs: s.bends > 0 ? r2(noise((s.bends * s.quantity * TRUE.bendSecPerBend) / 3600, 0.05)) : 0,
      laborRate: Math.round(noise(TRUE.laborRate, 0.03)),
      marginPct,
    },
    outcome: rand() < winProb ? 'won' : 'lost',
  };
}

const records = [];
let id = 1000;

// --- One-off jobs -------------------------------------------------------
const BASE = 34;
for (let i = 0; i < BASE; i++) {
  const material = pick(MATERIALS);
  const L = r2(6 + rand() * 30), W = r2(4 + rand() * 20);
  const s = {
    material,
    quantity: pick([2, 4, 6, 10, 12, 20, 25, 40, 60, 100]),
    thicknessIn: pick([0.06, 0.09, 0.125, 0.1875, 0.25, 0.375, 0.5]),
    areaSqIn: r2(L * W),
    cutLengthIn: r2(2 * (L + W)),
    holes: pick([0, 0, 2, 4, 6, 8, 12]),
    weldLengthIn: pick([0, 0, 12, 18.5, 24, 31, 48]),
    bends: pick([0, 0, 2, 4, 6, 8]),
    finish: isAl(material) ? pick(['none', 'anodize', 'powder']) : pick(FINISHES),
  };
  records.push(Object.assign({ id: 'J-' + id++, partName: pick(PART_NAMES), sawCuts: 0 }, s, actualsFor(s)));
}

// --- Re-orders: near-duplicates of earlier parts (small dimensional drift) ---
const REORDERS = 14;
for (let i = 0; i < REORDERS; i++) {
  const base = records[Math.floor(rand() * BASE)];
  const jitter = (v, p) => r2(v * (1 + (rand() * 2 - 1) * p));
  const s = {
    material: base.material,
    quantity: base.quantity,
    thicknessIn: base.thicknessIn,
    areaSqIn: jitter(base.areaSqIn, 0.06),
    cutLengthIn: jitter(base.cutLengthIn, 0.06),
    holes: base.holes,
    weldLengthIn: base.weldLengthIn ? jitter(base.weldLengthIn, 0.05) : 0,
    bends: base.bends,
    finish: base.finish,
  };
  records.push(Object.assign(
    { id: 'J-' + id++, partName: base.partName + ' (re-order)', sawCuts: 0 }, s, actualsFor(s)));
}

const out = path.join(__dirname, 'history.sample.jsonl');
fs.writeFileSync(out, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
const won = records.filter((r) => r.outcome === 'won').length;
console.log(`Wrote ${records.length} jobs (${BASE} one-off + ${REORDERS} re-orders) to ${path.basename(out)}  (${won} won / ${records.length - won} lost)`);
