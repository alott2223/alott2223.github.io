/*
 * Resolves which Claude model the AI paths (drawing/RFQ parsing) use.
 *
 * Default is Haiku 4.5 — the cheapest current model ($1 / $5 per M tokens), which
 * keeps per-RFQ cost near zero (a fraction of a cent). Extraction into a strict
 * schema is an easy task, so the small model is usually plenty. Bump it up when a
 * drawing or email is messy:
 *
 *   --model claude-sonnet-5      (or)   export QUOTEFORGE_MODEL=claude-opus-4-8
 */
'use strict';
const DEFAULT_MODEL = 'claude-haiku-4-5';

function resolveModel(flags) {
  return (flags && flags.model) || process.env.QUOTEFORGE_MODEL || DEFAULT_MODEL;
}

module.exports = { resolveModel, DEFAULT_MODEL };
