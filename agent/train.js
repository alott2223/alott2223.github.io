#!/usr/bin/env node
/*
 * QuoteForge trainer — learns a shop's real numbers from its job history.
 *
 * This is the "rates & margins learned over time" piece. It does NOT train a
 * neural net; it calibrates the deterministic pricing engine from recorded
 * outcomes:
 *   - operation rates  (laser, drill, weld, stainless factor, brake) — from the
 *                       actual hours each past job took, by regression through 0
 *   - labor rate       — averaged from the shop's recorded rate
 *   - target margin     — from win/loss: the highest margin that still wins often
 *
 * Output: rates.calibrated.json, which quote-agent.js loads automatically so new
 * quotes reflect this shop instead of the generic defaults.
 *
 * Usage:
 *   node train.js                         # uses data/history.sample.jsonl
 *   node train.js data/my-history.jsonl
 *   node train.js --win-target 0.55       # margin must keep >=55% win rate
 */
'use strict';
const fs = require('fs');
const path = require('path');
const pricing = require('./pricing.js');
const { loadHistory } = require('./lib/history.js');

const DEFAULTS = pricing.RATES;
const round = (n, p) => { const f = Math.pow(10, p || 2); return Math.round(n * f) / f; };
const isSS = (m) => m === 'ss304' || m === 'ss316';

// Regression through the origin: rate = Σwork / Σhours, over jobs that used the op.
function fitRate(history, workOf, hoursOf) {
  let work = 0, hrs = 0, n = 0;
  for (const j of history) {
    const w = workOf(j), h = hoursOf(j);
    if (w > 0 && h > 0) { work += w; hrs += h; n++; }
  }
  return n ? { value: work / hrs, n } : null;
}

function calibrate(history, opts) {
  opts = opts || {};
  const winTarget = opts.winTarget != null ? opts.winTarget : 0.6;
  const notes = [];
  const rates = Object.assign({}, DEFAULTS);

  // Laser cutting: inches per minute
  const laser = fitRate(history,
    (j) => (j.cutLengthIn || 0) * j.quantity,
    (j) => (j.actual && j.actual.cutHrs) || 0);
  if (laser) rates.laserInPerMin = round(laser.value / 60, 2);
  else notes.push('No cutting data — kept default laserInPerMin.');

  // Drilling: seconds per hole (a time-per-unit rate → seconds / holes)
  const drill = fitRate(history,
    (j) => ((j.actual && j.actual.drillHrs) || 0) * 3600,
    (j) => (j.holes || 0) * j.quantity);
  if (drill) rates.drillSecPerHole = round(drill.value, 1);
  else notes.push('No drilling data — kept default drillSecPerHole.');

  // Welding (mild): inches per minute, from non-stainless jobs
  const mildWeld = fitRate(history.filter((j) => !isSS(j.material)),
    (j) => (j.weldLengthIn || 0) * j.quantity,
    (j) => (j.actual && j.actual.weldHrs) || 0);
  if (mildWeld) rates.weldInPerMin = round(mildWeld.value / 60, 2);
  else notes.push('No mild-steel weld data — kept default weldInPerMin.');

  // Stainless weld factor = ss rate / mild rate
  const ssWeld = fitRate(history.filter((j) => isSS(j.material)),
    (j) => (j.weldLengthIn || 0) * j.quantity,
    (j) => (j.actual && j.actual.weldHrs) || 0);
  if (ssWeld && mildWeld) rates.ssWeldFactor = round((ssWeld.value) / (mildWeld.value), 2);
  else notes.push('Not enough stainless weld data — kept default ssWeldFactor.');

  // Brake forming: seconds per bend (time-per-unit → seconds / bends)
  const bend = fitRate(history,
    (j) => ((j.actual && j.actual.bendHrs) || 0) * 3600,
    (j) => (j.bends || 0) * j.quantity);
  if (bend) rates.bendSecPerBend = round(bend.value, 1);
  else notes.push('No forming data — kept default bendSecPerBend.');

  // Labor rate: average recorded rate
  const laborVals = history.map((j) => j.actual && j.actual.laborRate).filter((x) => x > 0);
  const laborRate = laborVals.length
    ? Math.round(laborVals.reduce((a, b) => a + b, 0) / laborVals.length)
    : 95;
  if (!laborVals.length) notes.push('No labor-rate data — kept default $95/hr.');

  // Margin from win/loss
  const buckets = {};
  for (const j of history) {
    const m = j.actual && j.actual.marginPct;
    if (m == null) continue;
    (buckets[m] = buckets[m] || { jobs: 0, wins: 0 });
    buckets[m].jobs++;
    if (j.outcome === 'won') buckets[m].wins++;
  }
  const marginAnalysis = Object.keys(buckets).map(Number).sort((a, b) => a - b).map((m) => ({
    marginPct: m, jobs: buckets[m].jobs, wins: buckets[m].wins,
    winRatePct: Math.round(100 * buckets[m].wins / buckets[m].jobs),
  }));
  // Recommend the HIGHEST margin whose win rate still meets the target.
  const eligible = marginAnalysis.filter((b) => b.jobs >= 2 && b.winRatePct >= winTarget * 100);
  let recommendedMargin = eligible.length
    ? eligible[eligible.length - 1].marginPct
    : (marginAnalysis.length
      // fallback: margin with the best expected value (winRate * margin)
      ? marginAnalysis.slice().sort((a, b) =>
          (b.winRatePct / 100 * b.marginPct) - (a.winRatePct / 100 * a.marginPct))[0].marginPct
      : 28);
  if (!marginAnalysis.length) notes.push('No margin/outcome data — kept default 28%.');

  return {
    generatedAt: new Date().toISOString(),
    sampleSize: history.length,
    rates,
    defaults: { laborRate, marginPct: recommendedMargin },
    recommendedMargin,
    winTarget,
    marginAnalysis,
    notes,
  };
}

// --------- CLI ---------
function reportLine(l, r) { return '  ' + l.padEnd(26) + r; }

function printReport(cfg) {
  console.log(`\nQuoteForge trainer — calibrated from ${cfg.sampleSize} jobs\n`);
  console.log('  Operation rates (learned):');
  console.log(reportLine('  laser cut', `${cfg.rates.laserInPerMin} in/min`));
  console.log(reportLine('  drilling', `${cfg.rates.drillSecPerHole} sec/hole`));
  console.log(reportLine('  welding (mild)', `${cfg.rates.weldInPerMin} in/min`));
  console.log(reportLine('  stainless factor', `${cfg.rates.ssWeldFactor}×`));
  console.log(reportLine('  brake forming', `${cfg.rates.bendSecPerBend} sec/bend`));
  console.log(reportLine('  labor rate', `$${cfg.defaults.laborRate}/hr`));
  console.log('\n  Margin vs. win rate:');
  console.log('    margin   jobs   won   win%');
  cfg.marginAnalysis.forEach((b) => {
    const star = b.marginPct === cfg.recommendedMargin ? '  ← recommended' : '';
    console.log(`     ${String(b.marginPct).padStart(3)}%   ${String(b.jobs).padStart(4)}  ${String(b.wins).padStart(4)}  ${String(b.winRatePct).padStart(4)}%${star}`);
  });
  console.log(`\n  Recommended margin: ${cfg.recommendedMargin}% (keeps ≥${Math.round(cfg.winTarget * 100)}% win rate)`);
  if (cfg.notes.length) { console.log('\n  Notes:'); cfg.notes.forEach((n) => console.log('   • ' + n)); }
  console.log('');
}

function main() {
  const argv = process.argv.slice(2);
  const opts = {};
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--win-target') opts.winTarget = parseFloat(argv[++i]);
    else if (!argv[i].startsWith('--')) file = argv[i];
  }
  file = file || path.join(__dirname, 'data', 'history.sample.jsonl');
  if (!fs.existsSync(file)) {
    console.error(`History file not found: ${file}`);
    console.error('Generate the sample with: node data/gen-sample.js');
    process.exit(1);
  }
  const history = loadHistory(file);
  if (!history.length) { console.error('History is empty.'); process.exit(1); }

  const cfg = calibrate(history, opts);
  const out = path.join(__dirname, 'rates.calibrated.json');
  fs.writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
  printReport(cfg);
  console.log(`  Saved → ${path.basename(out)}  (quote-agent.js will use it automatically)\n`);
}

if (require.main === module) main();
module.exports = { calibrate };
