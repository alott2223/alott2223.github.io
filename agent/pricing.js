/*
 * QuoteForge pricing engine — deterministic, no AI, no network.
 *
 * This is the single source of truth for how a job spec becomes a priced,
 * itemized quote. Both the local AI agent (agent/quote-agent.js) and the
 * website's in-browser Quote Builder use this exact logic, so a quote is
 * reproducible no matter which surface produced it.
 *
 * Works in Node (module.exports) and the browser (window.QuoteForgePricing).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuoteForgePricing = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- Reference data ---------------------------------------------------
  // Densities in lb/in^3. Spot prices in $/lb (indicative — a real deployment
  // would refresh these from a live materials feed).
  const MATERIALS = {
    a36:   { label: 'A36 mild steel',      density: 0.2836, pricePerLb: 0.68 },
    a1011: { label: 'A1011 HR steel',      density: 0.2836, pricePerLb: 0.62 },
    ss304: { label: '304 stainless',       density: 0.2890, pricePerLb: 3.87 },
    ss316: { label: '316 stainless',       density: 0.2890, pricePerLb: 4.95 },
    al5052:{ label: '5052 aluminum',       density: 0.0968, pricePerLb: 2.14 },
    al6061:{ label: '6061 aluminum',       density: 0.0975, pricePerLb: 2.35 },
  };

  // Operation productivity + default machine/labor rates.
  const RATES = {
    laserInPerMin:   28,   // linear inches of cut per minute
    sawSecPerCut:    45,   // seconds per saw cut
    drillSecPerHole: 22,   // seconds per drilled hole
    weldInPerMin:    3.2,  // inches of fillet weld deposited per minute (mild)
    bendSecPerBend:  25,   // seconds per brake bend
    ssWeldFactor:    0.7,  // stainless welds ~30% slower travel
  };

  const FINISHES = {
    none:      { label: 'None',            perPart: 0,    flat: 0   },
    powder:    { label: 'Powder coat',     perPart: 6.50, flat: 45  },
    zinc:      { label: 'Zinc plating',    perPart: 4.25, flat: 40  },
    passivate: { label: 'Passivation',     perPart: 3.10, flat: 60  },
    anodize:   { label: 'Anodize (Al)',    perPart: 7.80, flat: 55  },
  };

  function round2(n) { return Math.round(n * 100) / 100; }
  function usd(n) {
    return '$' + round2(n).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  // --- Core estimator ---------------------------------------------------
  /**
   * @param {object} job
   * @param {string} job.material     key into MATERIALS (e.g. "a36")
   * @param {number} job.quantity     number of parts
   * @param {number} job.thicknessIn  material thickness, inches
   * @param {number} job.areaSqIn     flat area of ONE part, in^2 (for weight)
   * @param {number} [job.cutLengthIn]   perimeter/cut length per part, inches (laser)
   * @param {number} [job.sawCuts]       saw cuts per part (structural)
   * @param {number} [job.holes]         drilled holes per part
   * @param {number} [job.weldLengthIn]  fillet weld length per part, inches
   * @param {number} [job.bends]         brake bends per part
   * @param {string} [job.finish]        key into FINISHES
   * @param {number} [job.laborRate]     shop labor rate $/hr (default 95)
   * @param {number} [job.marginPct]     margin percentage (default 28)
   * @returns {{lines: [string, number][], subtotal, margin, total, confidence, meta}}
   */
  function estimate(job, config) {
    const errs = validate(job);
    if (errs.length) throw new Error('Invalid job: ' + errs.join('; '));

    // Calibrated config (from train.js) overrides the built-in defaults.
    config = config || {};
    const rates = Object.assign({}, RATES, config.rates || {});
    const priceOverrides = config.materialPrices || {};
    const defaults = config.defaults || {};

    const baseMat = MATERIALS[job.material];
    const mat = priceOverrides[job.material] != null
      ? Object.assign({}, baseMat, { pricePerLb: priceOverrides[job.material] })
      : baseMat;
    const qty = job.quantity;
    const laborRate = job.laborRate > 0 ? job.laborRate
      : (defaults.laborRate > 0 ? defaults.laborRate : 95);
    const marginPct = job.marginPct != null ? job.marginPct
      : (defaults.marginPct != null ? defaults.marginPct : 28);
    const isStainless = job.material === 'ss304' || job.material === 'ss316';

    const lines = [];

    // Material: weight = area * thickness * density, per part * qty
    const weightLb = job.areaSqIn * job.thicknessIn * mat.density * qty;
    const materialCost = weightLb * mat.pricePerLb;
    lines.push([
      `Material — ${mat.label} ${job.thicknessIn}" (${round2(weightLb)} lb)`,
      materialCost,
    ]);

    // Cutting (laser by cut length, or saw by cut count)
    let cutHrs = 0;
    if (job.cutLengthIn > 0) cutHrs += (job.cutLengthIn * qty) / rates.laserInPerMin / 60;
    if (job.sawCuts > 0)     cutHrs += (job.sawCuts * qty * rates.sawSecPerCut) / 3600;
    if (cutHrs > 0) {
      lines.push([`Cutting (${round2(cutHrs)} hr @ ${usd(laborRate)})`, cutHrs * laborRate]);
    }

    // Drilling
    if (job.holes > 0) {
      const drillHrs = (job.holes * qty * rates.drillSecPerHole) / 3600;
      lines.push([`Drilling — ${job.holes * qty} holes (${round2(drillHrs)} hr)`, drillHrs * laborRate]);
    }

    // Welding
    if (job.weldLengthIn > 0) {
      const rate = rates.weldInPerMin * (isStainless ? rates.ssWeldFactor : 1);
      const weldHrs = (job.weldLengthIn * qty) / rate / 60;
      lines.push([
        `Welding — ${round2(job.weldLengthIn * qty)}" fillet (${round2(weldHrs)} hr @ ${usd(laborRate)})`,
        weldHrs * laborRate,
      ]);
    }

    // Forming / bending
    if (job.bends > 0) {
      const bendHrs = (job.bends * qty * rates.bendSecPerBend) / 3600;
      lines.push([`Forming — ${job.bends * qty} bends (${round2(bendHrs)} hr)`, bendHrs * laborRate]);
    }

    // Finishing
    const finish = FINISHES[job.finish] || FINISHES.none;
    if (finish.perPart > 0 || finish.flat > 0) {
      const finishCost = finish.flat + finish.perPart * qty;
      lines.push([`${finish.label} (${qty} pcs)`, finishCost]);
    }

    const subtotal = lines.reduce((s, l) => s + l[1], 0);
    const margin = subtotal * (marginPct / 100);
    const total = subtotal + margin;

    // Confidence: fewer under-specified fields → higher confidence.
    const provided = ['cutLengthIn', 'sawCuts', 'holes', 'weldLengthIn', 'bends']
      .filter((k) => job[k] > 0).length;
    const confidence = Math.min(96, 82 + provided * 3);

    return {
      lines: lines.map((l) => [l[0], round2(l[1])]),
      subtotal: round2(subtotal),
      margin: round2(margin),
      marginPct,
      total: round2(total),
      confidence,
      meta: { weightLb: round2(weightLb), material: mat.label, quantity: qty },
    };
  }

  function validate(job) {
    const e = [];
    if (!job || typeof job !== 'object') return ['job must be an object'];
    if (!MATERIALS[job.material]) e.push(`unknown material "${job.material}"`);
    if (!(job.quantity > 0)) e.push('quantity must be > 0');
    if (!(job.thicknessIn > 0)) e.push('thicknessIn must be > 0');
    if (!(job.areaSqIn > 0)) e.push('areaSqIn must be > 0');
    return e;
  }

  return { MATERIALS, RATES, FINISHES, estimate, validate, round2, usd };
});
