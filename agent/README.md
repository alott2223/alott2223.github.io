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

## Verify it works (no API key needed)

```bash
npm run selftest     # 11 assertions against the pricing engine
npm run mock         # full render on a canned bracket spec
```

`selftest.js` checks the math directly (weight, stainless vs. mild weld cost,
quantity scaling, input validation). `--mock` exercises the whole
extract → price → render pipeline without touching the network.

## How pricing works

`pricing.js` is the single source of truth, shared with the website's in-browser
Quote Builder. It knows:

- **Materials** — density (lb/in³) and spot price ($/lb) for steel, stainless,
  and aluminum grades.
- **Operations** — laser/saw cutting, drilling, welding (stainless runs slower),
  brake forming, each with a productivity rate.
- **Finishing** — powder, zinc, passivation, anodize (flat setup + per-part).
- **Margin** — applied on top of the subtotal.

Rates are indicative constants. In production you'd wire the material prices to a
live feed and calibrate the operation rates to your own shop's history — the
structure is already here.

## Files

| File | Purpose |
|------|---------|
| `quote-agent.js` | CLI: drawing → Claude extraction → quote |
| `pricing.js` | Deterministic pricing engine (also runs in the browser) |
| `selftest.js` | Offline assertions for the pricing math |
| `package.json` | Deps + `npm run` scripts |

## Roadmap

- Wire material `pricePerLb` to a live metals feed
- Calibrate operation rates from won/lost quote history
- Email intake (forward an RFQ → quote reply), the flow the landing page describes
