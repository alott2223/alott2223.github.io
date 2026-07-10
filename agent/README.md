# QuoteForge Quote Agent

A working command-line agent that turns a fabrication **drawing** (PDF or image)
into a priced, itemized **quote**.

It splits the problem the honest way:

| Step | Who does it | How |
|------|-------------|-----|
| 1. Read the drawing → structured spec | **Claude vision** (`claude-opus-4-8`) | dimensions, material, welds, holes, bends, finish |
| 2. Spec → priced quote | **`pricing.js`** (plain math) | material weight, operation times, margin |

The AI never invents prices. It only extracts numbers; all money math is
deterministic and auditable, so the same spec always yields the same quote.

> This is the backend companion to the [QuoteForge landing page](https://alott.me).
> It is **not** served by the website (GitHub Pages is static) — it runs locally
> or on your own server, where an API key can be kept secret.

## Setup

```bash
cd agent
npm install
export ANTHROPIC_API_KEY=sk-ant-...     # your Anthropic API key
```

Requires Node.js 18+.

## Use

```bash
# Price a real drawing
node quote-agent.js path/to/bracket.pdf
node quote-agent.js path/to/enclosure.png

# Override what the drawing says
node quote-agent.js drawing.pdf --qty 40 --margin 30 --labor 105

# Machine-readable output (spec + quote as JSON)
node quote-agent.js drawing.pdf --json

# No API key? Run the pipeline on a canned spec:
node quote-agent.js --mock
```

Supported inputs: `.pdf`, `.png`, `.jpg`, `.webp`, `.gif`.

## Training — learn your shop's real numbers

"Training" here is **calibration, not neural-net fine-tuning** (Claude isn't
fine-tuned; the *pricing engine* is). You feed the trainer a history of jobs you
actually ran — with the real hours each took and whether you won the quote — and
it learns:

- **operation rates** (laser in/min, sec/hole, weld in/min, stainless factor,
  sec/bend) — fit from the recorded hours,
- **labor rate** — averaged from your records,
- **target margin** — the highest margin that still wins often enough.

```bash
# 1. Get sample data (deterministic; already committed, regenerate anytime)
npm run gen-data

# 2. Train — writes rates.calibrated.json and prints a report
npm run train
#   → learned laser 26.3 in/min, drill 24 sec/hole, weld 3.0 in/min, labor $98/hr
#   → recommended margin 32% (keeps ≥60% win rate)
```

Once `rates.calibrated.json` exists, **`quote-agent.js` uses it automatically** —
new quotes reflect your shop instead of the generic defaults, and each quote
reports how many similar past jobs it matched (kNN over your history). Use
`--raw` to price with the built-in defaults, or `--history <file>` to match
against a different history file.

**Your own data:** point the trainer at a JSONL/JSON file of records shaped like
`data/history.sample.jsonl` (spec + `actual` hours + `outcome`):

```bash
node train.js data/my-history.jsonl --win-target 0.55
```

## Verify it works (no API key needed)

```bash
npm run selftest     # 24 assertions: pricing math, calibration, matching
npm run mock         # full render on a canned bracket spec (uses learned rates)
```

`selftest.js` checks the math directly (weight, stainless vs. mild weld cost,
quantity scaling, validation), that the trainer **recovers the hidden true rates**
from the sample data within tolerance, and that similar-job matching finds
re-order clusters. `--mock` exercises the whole extract → price → render pipeline
without touching the network.

## How pricing works

`pricing.js` is the single source of truth, shared with the website's in-browser
Quote Builder. It knows:

- **Materials** — density (lb/in³) and spot price ($/lb) for steel, stainless,
  and aluminum grades.
- **Operations** — laser/saw cutting, drilling, welding (stainless runs slower),
  brake forming, each with a productivity rate.
- **Finishing** — powder, zinc, passivation, anodize (flat setup + per-part).
- **Margin** — applied on top of the subtotal.

Rates start as indicative constants and are **overridden by `rates.calibrated.json`
once you train** (see above). In production you'd also wire material prices to a
live metals feed — `estimate(job, {materialPrices})` already accepts that.

## Files

| File | Purpose |
|------|---------|
| `quote-agent.js` | CLI: drawing → Claude extraction → priced quote (+ learned rates, similar jobs) |
| `pricing.js` | Deterministic pricing engine (also runs in the browser); takes an optional calibrated config |
| `train.js` | Learns rates + margin from job history → `rates.calibrated.json` |
| `lib/history.js` | Load history; kNN similar-job matching |
| `data/gen-sample.js` | Deterministic sample-history generator (hidden true rates) |
| `data/history.sample.jsonl` | 48-job sample history (one-offs + re-orders) |
| `rates.calibrated.json` | Output of `train.js` (auto-generated; consumed by the agent) |
| `selftest.js` | Offline assertions: math, calibration recovery, matching |
| `package.json` | Deps + `npm run` scripts |

## Roadmap

- [x] Calibrate operation rates + margin from won/lost quote history
- [x] Match new jobs to similar past jobs (history-backed confidence)
- [ ] Wire material `pricePerLb` to a live metals feed
- [ ] Append each new won/lost quote back into history (continuous learning)
- [ ] Email intake (forward an RFQ → quote reply), the flow the landing page describes
