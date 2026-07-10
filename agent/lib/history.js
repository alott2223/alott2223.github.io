/*
 * History utilities: load job records and find similar past jobs (kNN).
 * Powers the "matched to N similar jobs in your history" behavior.
 */
'use strict';
const fs = require('fs');

// Accepts .jsonl (one JSON object per line) or a .json array.
function loadHistory(file) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];
  if (raw[0] === '[') return JSON.parse(raw);
  return raw.split('\n').filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) { throw new Error(`Bad JSON on line ${i + 1} of ${file}: ${e.message}`); }
  });
}

// Numeric features used for the similarity distance.
const FEATURES = ['quantity', 'thicknessIn', 'areaSqIn', 'cutLengthIn', 'holes', 'weldLengthIn', 'bends'];

function stats(history) {
  const mean = {}, std = {};
  FEATURES.forEach((f) => {
    const xs = history.map((h) => Number(h[f]) || 0);
    const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length || 1);
    mean[f] = m; std[f] = Math.sqrt(v) || 1; // avoid /0
  });
  return { mean, std };
}

// Normalized Euclidean distance, with a penalty when materials differ.
function distance(a, b, st) {
  let d = 0;
  FEATURES.forEach((f) => {
    const za = ((Number(a[f]) || 0) - st.mean[f]) / st.std[f];
    const zb = ((Number(b[f]) || 0) - st.mean[f]) / st.std[f];
    d += (za - zb) * (za - zb);
  });
  if (a.material !== b.material) d += 4; // ~2 std of separation for a material mismatch
  return Math.sqrt(d);
}

/**
 * Return the k jobs in `history` most similar to `job`, each with a 0–100
 * similarity score, plus a summary used to bump quote confidence.
 */
function similar(job, history, k) {
  k = k || 3;
  if (!history.length) return { matches: [], count: 0, avgScore: 0 };
  const st = stats(history);
  const scored = history.map((h) => {
    const dist = distance(job, h, st);
    return { job: h, dist, score: Math.round(100 * Math.exp(-dist / 2)) };
  }).sort((a, b) => a.dist - b.dist);
  const matches = scored.slice(0, k);
  // "close" matches: same material and score ≥ 55
  const close = scored.filter((m) => m.score >= 55 && m.job.material === job.material);
  const avgScore = matches.reduce((s, m) => s + m.score, 0) / matches.length;
  return { matches, count: close.length, avgScore: Math.round(avgScore) };
}

module.exports = { loadHistory, similar, FEATURES };
