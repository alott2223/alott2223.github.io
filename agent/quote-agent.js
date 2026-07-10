#!/usr/bin/env node
/*
 * QuoteForge quote agent
 * ----------------------
 * Reads a fabrication drawing (image or PDF), uses Claude vision to extract a
 * structured job spec, then prices it deterministically with ./pricing.js.
 *
 * The AI does ONE job: turn a messy drawing into structured numbers. All money
 * math is done by the pricing engine, so quotes are explainable and reproducible
 * — the same spec always produces the same quote, and you can audit every line.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   node quote-agent.js path/to/drawing.pdf
 *   node quote-agent.js path/to/bracket.png --qty 40 --margin 30
 *   node quote-agent.js --mock            # no API key needed; canned extraction
 *   node quote-agent.js path/to/x.pdf --json   # machine-readable output
 *
 * Flags: --qty N  --margin P  --labor R  --material KEY  (override extraction)
 *        --mock   --json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pricing = require('./pricing.js');
const { loadHistory, similar } = require('./lib/history.js');

const MODEL = 'claude-opus-4-8';
const CALIB_FILE = path.join(__dirname, 'rates.calibrated.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'history.sample.jsonl');

// ---- CLI parsing ----------------------------------------------------------
function parseArgs(argv) {
  const args = { flags: {}, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mock') args.flags.mock = true;
    else if (a === '--json') args.flags.json = true;
    else if (a === '--raw') args.flags.raw = true;       // ignore learned rates
    else if (a.startsWith('--')) args.flags[a.slice(2)] = argv[++i];
    else args.file = a;
  }
  return args;
}

const MEDIA = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
};

// The structured shape we force Claude to return. Strict JSON schema — every
// object needs additionalProperties:false + required (structured-outputs rule).
const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'material', 'quantity', 'thicknessIn', 'areaSqIn', 'cutLengthIn',
    'sawCuts', 'holes', 'weldLengthIn', 'bends', 'finish', 'partName', 'notes',
  ],
  properties: {
    material: { type: 'string', enum: Object.keys(pricing.MATERIALS),
      description: 'Best-match stock material for this part.' },
    quantity: { type: 'integer', description: 'Number of parts requested (default 1 if unstated).' },
    thicknessIn: { type: 'number', description: 'Material thickness in inches.' },
    areaSqIn: { type: 'number', description: 'Flat area of ONE part in square inches (estimate from the drawing dimensions).' },
    cutLengthIn: { type: 'number', description: 'Total laser/plasma cut perimeter length per part, inches. 0 if not applicable.' },
    sawCuts: { type: 'integer', description: 'Number of saw cuts per part for structural/tube stock. 0 if none.' },
    holes: { type: 'integer', description: 'Number of drilled/punched holes per part. 0 if none.' },
    weldLengthIn: { type: 'number', description: 'Total fillet weld length per part, inches. 0 if none.' },
    bends: { type: 'integer', description: 'Number of brake bends per part. 0 if none.' },
    finish: { type: 'string', enum: Object.keys(pricing.FINISHES),
      description: 'Requested surface finish.' },
    partName: { type: 'string', description: 'Short human-readable name for the part.' },
    notes: { type: 'string', description: 'One or two sentences on what you read and any assumptions made.' },
  },
};

const SYSTEM = `You are a senior estimator at a metal fabrication shop. You are given a
customer drawing (PDF or image). Extract a structured job specification a shop
would use to quote it. Read dimensions, materials, weld symbols, hole callouts,
bend lines, and finish notes.

Rules:
- Estimate areaSqIn from the part's overall footprint if not stated outright.
- If a value is genuinely not applicable, use 0 (never guess a large number).
- If quantity is not stated, use 1.
- Pick the single closest material from the allowed list.
- Be conservative: it is better to under-count an operation than invent one.`;

function fileToBlock(file) {
  const ext = path.extname(file).toLowerCase();
  const media = MEDIA[ext];
  if (!media) throw new Error(`Unsupported file type "${ext}". Use PNG/JPG/WEBP/GIF or PDF.`);
  const data = fs.readFileSync(file).toString('base64');
  if (media === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: media, data } };
  }
  return { type: 'image', source: { type: 'base64', media_type: media, data } };
}

// ---- Extraction (real + mock) --------------------------------------------
async function extractWithClaude(file) {
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch (e) {
    throw new Error('Missing dependency. Run `npm install` in the agent/ folder first.');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Export your key, or run with --mock.');
  }
  const client = new Anthropic();

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        fileToBlock(file),
        { type: 'text', text: 'Extract the job specification from this drawing.' },
      ],
    }],
  });

  if (resp.stop_reason === 'refusal') {
    throw new Error('The model declined to process this drawing.');
  }
  const textBlock = resp.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No structured output returned.');
  return { spec: JSON.parse(textBlock.text), usage: resp.usage };
}

function mockExtract() {
  return {
    spec: {
      material: 'a36', quantity: 40, thicknessIn: 0.375, areaSqIn: 96,
      cutLengthIn: 42, sawCuts: 0, holes: 4, weldLengthIn: 18.5, bends: 0,
      finish: 'powder', partName: 'Welded steel bracket',
      notes: 'MOCK: canned bracket spec — no drawing was read (offline test path).',
    },
    usage: null,
  };
}

// ---- Rendering ------------------------------------------------------------
function applyOverrides(spec, flags) {
  if (flags.qty) spec.quantity = parseInt(flags.qty, 10);
  if (flags.material) spec.material = flags.material;
  if (flags.margin != null) spec._marginPct = parseFloat(flags.margin);
  if (flags.labor) spec._laborRate = parseFloat(flags.labor);
  return spec;
}

function toJob(spec, calib) {
  const d = (calib && calib.defaults) || {};
  return {
    material: spec.material, quantity: spec.quantity, thicknessIn: spec.thicknessIn,
    areaSqIn: spec.areaSqIn, cutLengthIn: spec.cutLengthIn, sawCuts: spec.sawCuts,
    holes: spec.holes, weldLengthIn: spec.weldLengthIn, bends: spec.bends,
    finish: spec.finish,
    // Flag override wins; otherwise the learned default; otherwise the built-in.
    marginPct: spec._marginPct != null ? spec._marginPct
      : (d.marginPct != null ? d.marginPct : 28),
    laborRate: spec._laborRate || d.laborRate || 95,
  };
}

function printQuote(spec, quote, match, calib) {
  match = match || { count: 0 };
  const qn = 'Q-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
  const W = 54;
  const line = (l, r) => {
    const right = pricing.usd(r);
    const left = l.length > W - right.length - 1 ? l.slice(0, W - right.length - 2) + '…' : l;
    return left + ' '.repeat(Math.max(1, W - left.length - right.length)) + right;
  };
  console.log('');
  console.log('  ┌' + '─'.repeat(W + 2) + '┐');
  console.log('  │ ' + `QUOTEFORGE  ·  ${qn}`.padEnd(W) + ' │');
  console.log('  │ ' + `${spec.partName} ×${spec.quantity}`.slice(0, W).padEnd(W) + ' │');
  console.log('  ├' + '─'.repeat(W + 2) + '┤');
  quote.lines.forEach((l) => console.log('  │ ' + line(l[0], l[1]) + ' │'));
  console.log('  │ ' + line(`Margin (${quote.marginPct}%)`, quote.margin) + ' │');
  console.log('  ├' + '─'.repeat(W + 2) + '┤');
  console.log('  │ ' + line('QUOTE TOTAL', quote.total) + ' │');
  console.log('  └' + '─'.repeat(W + 2) + '┘');
  const conf = Math.min(98, quote.confidence + (match.count > 0 ? 3 : 0));
  console.log(`   confidence ${conf}%  ·  ${quote.meta.weightLb} lb ${quote.meta.material}`);
  if (match.count > 0) {
    console.log(`   matched to ${match.count} similar job(s) in your history`);
  }
  console.log(calib
    ? `   using learned rates (trained on ${calib.sampleSize} jobs)`
    : `   using default rates — run \`node train.js\` to calibrate to your shop`);
  if (spec.notes) console.log(`   note: ${spec.notes}`);
  console.log('');
}

// ---- Main -----------------------------------------------------------------
async function main() {
  const { flags, file } = parseArgs(process.argv.slice(2));

  if (!flags.mock && !file) {
    console.error('Usage: node quote-agent.js <drawing.pdf|.png> [--qty N] [--margin P] [--labor R]');
    console.error('       node quote-agent.js --mock');
    process.exit(1);
  }

  let extracted;
  try {
    if (flags.mock) {
      extracted = mockExtract();
    } else {
      if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
      process.stderr.write(`Reading ${path.basename(file)} with ${MODEL}…\n`);
      extracted = await extractWithClaude(file);
    }
  } catch (err) {
    console.error('Error: ' + err.message);
    process.exit(1);
  }

  const spec = applyOverrides(extracted.spec, flags);

  // Use learned rates if the shop has trained (rates.calibrated.json), unless --raw.
  let calib = null;
  if (!flags.raw && fs.existsSync(CALIB_FILE)) {
    try { calib = JSON.parse(fs.readFileSync(CALIB_FILE, 'utf8')); }
    catch (e) { process.stderr.write('Warning: could not read rates.calibrated.json\n'); }
  }
  const job = toJob(spec, calib);

  let quote;
  try {
    quote = pricing.estimate(job, calib || {});
  } catch (err) {
    console.error('Pricing error: ' + err.message);
    process.exit(1);
  }

  // Match against past jobs → history-backed confidence.
  let match = { count: 0, matches: [], avgScore: 0 };
  const histFile = flags.history || HISTORY_FILE;
  if (fs.existsSync(histFile)) {
    try { match = similar(job, loadHistory(histFile), 3); } catch (e) {}
  }

  if (flags.json) {
    console.log(JSON.stringify({
      spec, quote,
      calibrated: calib ? { sampleSize: calib.sampleSize, generatedAt: calib.generatedAt } : null,
      similarJobs: match.matches.map((m) => ({ id: m.job.id, score: m.score })),
    }, null, 2));
  } else {
    printQuote(spec, quote, match, calib);
    if (extracted.usage) {
      process.stderr.write(
        `   [tokens in ${extracted.usage.input_tokens}, out ${extracted.usage.output_tokens}]\n`
      );
    }
  }
}

main();
