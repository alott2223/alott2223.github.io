#!/usr/bin/env node
/*
 * QuoteForge RFQ intake — price a whole multi-part assembly from an RFQ.
 *
 * Two paths:
 *   node rfq.js data/rfq-2026-10482.json         # structured RFQ → quote (offline)
 *   node rfq.js --from-text rfq-email.txt        # raw RFQ text → Claude → quote
 *
 * The structured path is fully deterministic (no API key). --from-text uses
 * Claude to turn a free-form RFQ email into the same structured shape, which is
 * the "forward the email, get a quote back" flow the landing page describes.
 *
 * Flags: --reply (customer-facing quote email)  --from <addr>  --raw  --json
 *        --from-text <file>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const pricing = require('./pricing.js');

const MODEL = 'claude-opus-4-8';
const CALIB_FILE = path.join(__dirname, 'rates.calibrated.json');
const DEFAULT_RFQ = path.join(__dirname, 'data', 'rfq-2026-10482.json');

// ---- Structured RFQ schema (also what --from-text asks Claude to produce) ----
const partSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'quantity', 'material', 'thicknessIn', 'areaSqIn', 'cutLengthIn', 'holes', 'weldLengthIn', 'bends', 'finish'],
  properties: {
    name: { type: 'string' },
    quantity: { type: 'integer' },
    material: { type: 'string', enum: Object.keys(pricing.MATERIALS) },
    thicknessIn: { type: 'number' },
    areaSqIn: { type: 'number', description: 'flat area of one part = length × width' },
    cutLengthIn: { type: 'number', description: 'laser/plasma cut length per part' },
    holes: { type: 'integer' },
    weldLengthIn: { type: 'number', description: 'per-part weld; 0 if welding is assembly-level' },
    bends: { type: 'integer' },
    finish: { type: 'string', enum: Object.keys(pricing.FINISHES) },
  },
};
const RFQ_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['rfqId', 'name', 'quantity', 'material', 'materialPricePerLb', 'scrapPct',
    'laborRate', 'marginPct', 'parts', 'assemblyWeldIn', 'weldType', 'weldMaterial', 'adders', 'notes'],
  properties: {
    rfqId: { type: 'string' }, name: { type: 'string' },
    quantity: { type: 'integer', description: 'number of assemblies' },
    material: { type: 'string', enum: Object.keys(pricing.MATERIALS) },
    materialPricePerLb: { type: 'number' },
    scrapPct: { type: 'number' }, laborRate: { type: 'number' }, marginPct: { type: 'number' },
    parts: { type: 'array', items: partSchema },
    assemblyWeldIn: { type: 'number', description: 'weld length per assembly' },
    weldType: { type: 'string' },
    weldMaterial: { type: 'string', enum: Object.keys(pricing.MATERIALS) },
    adders: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['label', 'amount'],
        properties: { label: { type: 'string' }, amount: { type: 'number' } } },
    },
    notes: { type: 'string' },
  },
};

// ---- Intake ---------------------------------------------------------------
function loadStructured(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function fromText(file) {
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); }
  catch (e) { throw new Error('Missing dependency. Run `npm install` first.'); }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set (required for --from-text).');
  const text = fs.readFileSync(file, 'utf8');
  const client = new Anthropic();
  process.stderr.write(`Parsing ${path.basename(file)} with ${MODEL}…\n`);
  const resp = await client.messages.create({
    model: MODEL, max_tokens: 4096,
    system: 'You are an estimator. Convert this RFQ into the structured schema. ' +
      'Compute each part\'s areaSqIn from its length × width. Map materials/finishes to the closest allowed value. ' +
      'Put assembly-level weld length in assemblyWeldIn (not per part). Use the RFQ\'s own labor rate, margin, ' +
      'material price and scrap factor. Add reasonable fixed adders for any listed deliverables (inspection report, ' +
      'certification, packaging).',
    output_config: { format: { type: 'json_schema', schema: RFQ_SCHEMA } },
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  });
  if (resp.stop_reason === 'refusal') throw new Error('The model declined to parse this RFQ.');
  const tb = resp.content.find((b) => b.type === 'text');
  return JSON.parse(tb.text);
}

// ---- Rendering ------------------------------------------------------------
const W = 66;
function row(l, r) {
  const right = typeof r === 'number' ? pricing.usd(r) : r;
  const left = l.length > W - right.length - 1 ? l.slice(0, W - right.length - 2) + '…' : l;
  return '  ' + left + ' '.repeat(Math.max(1, W - left.length - right.length)) + right;
}
const rule = (ch) => '  ' + (ch || '─').repeat(W);

function printQuote(rfq, quote, calib) {
  const c = rfq.customer || {};
  console.log('');
  console.log('  QUOTE  ·  ' + (rfq.rfqId || ''));
  console.log('  ' + rfq.name);
  console.log('  ' + [c.company, c.industry].filter(Boolean).join('  ·  '));
  if (c.contact) console.log('  ' + c.contact);
  console.log('  ' + `${rfq.quantity} assemblies` + (rfq.leadTimeDays ? `  ·  lead time ${rfq.leadTimeDays} business days` : ''));
  console.log(rule('─'));
  quote.lines.forEach((l) => console.log(row(l[0], l[1])));
  console.log(rule('─'));
  console.log(row('Subtotal', quote.subtotal));
  console.log(row(`Margin (${quote.marginPct}%)`, quote.margin));
  console.log(rule('═'));
  console.log(row('QUOTE TOTAL', quote.total));
  console.log(row(`Unit price  (÷ ${quote.meta.quantity} assemblies)`, pricing.usd(quote.unitPrice) + ' /ea'));
  console.log('');
  console.log('  ' + `${quote.meta.parts} part types · ${quote.meta.weightLb} lb total material`);
  if (rfq.deliverables && rfq.deliverables.length) {
    console.log('  Deliverables: ' + rfq.deliverables.join(', '));
  }
  if (rfq.notes) console.log('  Customer note: "' + rfq.notes + '"');
  console.log(calib
    ? `  using learned rates (trained on ${calib.sampleSize} jobs) + this RFQ's own labor/margin/material price`
    : '  using default rates — run `node train.js` to calibrate');
  console.log('');
}

// ---- Customer-facing quote email ------------------------------------------
// Rolls internal lines into customer categories and folds margin INTO the
// prices — the customer sees category totals and the price, never the margin
// percentage or internal labor hours.
function renderEmail(rfq, quote, fromAddr) {
  const groups = [
    { label: 'Materials', re: /Material|Scrap/, total: 0 },
    { label: 'Fabrication (cut, drill, form, weld)', re: /Cutting|Drilling|Forming|welding|Welding/, total: 0 },
    { label: 'Finishing', re: /Bead blast|coat|plating|Passivation|Anodize|Deburr/, total: 0 },
    { label: 'Inspection, certification & packaging', re: /inspection|certification|Packaging|report/i, total: 0 },
  ];
  quote.lines.forEach((l) => {
    const g = groups.find((x) => x.re.test(l[0]));
    (g || groups[1]).total += l[1];
  });
  // Scale each category by (total/subtotal) so margin is folded in and the
  // categories sum to the quoted total. Push any rounding remainder to Materials.
  const scale = quote.total / quote.subtotal;
  let running = 0;
  groups.forEach((g) => { g.price = pricing.round2(g.total * scale); running += g.price; });
  groups[0].price = pricing.round2(groups[0].price + (quote.total - running));

  const c = rfq.customer || {};
  const L = [];
  L.push(`To: ${c.contact || ''}`);
  L.push(`From: QuoteForge <${fromAddr}>`);
  L.push(`Subject: Quote — ${rfq.name} (${rfq.rfqId})`);
  L.push('');
  L.push(`Hi${c.company ? ' ' + c.company : ''},`);
  L.push('');
  L.push(`Thank you for the RFQ. Please find our quote below for the ${rfq.name.toLowerCase()}, ${rfq.quantity} assemblies.`);
  L.push('');
  groups.forEach((g) => { if (g.price > 0) L.push(`  ${g.label.padEnd(40)} ${pricing.usd(g.price)}`); });
  L.push(`  ${''.padEnd(40)} ${'—'.repeat(10)}`);
  L.push(`  ${'Total'.padEnd(40)} ${pricing.usd(quote.total)}`);
  L.push(`  ${`Unit price (${rfq.quantity} assemblies)`.padEnd(40)} ${pricing.usd(quote.unitPrice)} /ea`);
  L.push('');
  if (rfq.leadTimeDays) L.push(`Lead time: ${rfq.leadTimeDays} business days from PO and approved drawings.`);
  if (rfq.deliverables && rfq.deliverables.length) L.push(`Includes: ${rfq.deliverables.join(', ')}.`);
  if (rfq.notes) L.push(`Noted: ${rfq.notes.replace(/\s+/g, ' ').trim()}`);
  L.push('');
  L.push('This quote is valid for 30 days. Prices in USD, FOB our facility, exclusive of applicable taxes.');
  L.push('Happy to adjust quantities or turnaround — just reply to this email.');
  L.push('');
  L.push('Best regards,');
  L.push('QuoteForge');
  L.push(fromAddr);
  return L.join('\n');
}

// ---- Main -----------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const flags = {};
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--raw') flags.raw = true;
    else if (argv[i] === '--json') flags.json = true;
    else if (argv[i] === '--reply') flags.reply = true;
    else if (argv[i] === '--from-text') flags.fromText = argv[++i];
    else if (argv[i] === '--from') flags.from = argv[++i];
    else if (!argv[i].startsWith('--')) file = argv[i];
  }

  let rfq;
  try {
    if (flags.fromText) rfq = await fromText(flags.fromText);
    else rfq = loadStructured(file || DEFAULT_RFQ);
  } catch (err) { console.error('Error: ' + err.message); process.exit(1); }

  // Learned operation rates, but the RFQ's own labor / margin / material price win.
  let calib = null;
  if (!flags.raw && fs.existsSync(CALIB_FILE)) {
    try { calib = JSON.parse(fs.readFileSync(CALIB_FILE, 'utf8')); } catch (e) {}
  }
  const config = {
    rates: calib ? calib.rates : {},
    materialPrices: { [rfq.material]: rfq.materialPricePerLb },
  };

  const assembly = {
    quantity: rfq.quantity, parts: rfq.parts, scrapPct: rfq.scrapPct,
    assemblyWeldIn: rfq.assemblyWeldIn, weldType: rfq.weldType, weldMaterial: rfq.weldMaterial,
    adders: rfq.adders, laborRate: rfq.laborRate, marginPct: rfq.marginPct,
  };

  let quote;
  try { quote = pricing.estimateAssembly(assembly, config); }
  catch (err) { console.error('Pricing error: ' + err.message); process.exit(1); }

  if (flags.json) console.log(JSON.stringify({ rfq: { rfqId: rfq.rfqId, name: rfq.name }, quote }, null, 2));
  else if (flags.reply) console.log(renderEmail(rfq, quote, flags.from || 'hello@alott.me'));
  else printQuote(rfq, quote, calib);
}

main();
