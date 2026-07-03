# PR 8.14 — Hypothesis Robustness Validator

## Purpose

Stress-test every generated hypothesis candidate before promotion. Computes time stability, regime stability, sample concentration, leave-one-period-out variance, and a composite robustness score (0–100).

## Usage

```bash
npm run research:hypothesis-validation
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/hypothesis-validation.json` |
| `--html-output` | `data/reports/research-hypothesis-validation.html` |
| `--hypothesis-candidates` | `data/research-results/hypothesis-candidates.json` |
| `--mispricing-atlas` | `data/research-results/mispricing-atlas.json` |
| `--research-results-dir` | `data/research-results` |
| `--regime-tags` | `data/research-results/regime-tags.json` |

## Inputs

- `hypothesis-candidates.json` — candidate list from M8 hypotheses step
- `mispricing-atlas.json` — required artifact guard (validation re-derives bucket observations from research outputs)
- `research-output.json` files under `--research-results-dir`
- `regime-tags.json` — volatility regime joins for regime stability

## Outputs

- `hypothesis-validation.json` — per-hypothesis score, pass/fail, reasons, and diagnostics
- `research-hypothesis-validation.html` — human-readable report with stability and concentration metrics

## Pass criteria

A hypothesis **passes** when:

- Robustness score ≥ 70
- Sample is not single-day dominated (≥ 50% from one trading day)
- Observation count ≥ 2 × minimum period observations (default 6)

Atlas-calibration hypotheses (`atlas-*`) receive full metrics. Lead-lag and other non-atlas IDs are marked unsupported with score 0.

## Constraints

- Read-only validation layer — does not modify replay, strategy execution, atlas generation, or hypothesis generation

## Verification

```bash
npm run lint
npm run test
npm run build
npm run research:hypothesis-validation
```
