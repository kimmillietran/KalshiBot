# PR-8.2 — Event Study Framework

## Summary

Milestone 8.2 adds descriptive event-study analysis around externally defined macro/market events. The framework buckets replay observations into before, during, and after windows and reports volatility, spread, calibration, and strategy PnL shifts.

This is **not** a trading strategy change and performs **no live API fetching**.

## CLI

```bash
npm run research:event-study -- --events data/events/events.json
```

Defaults:

| Flag | Default |
|------|---------|
| `--input-dir` | `data/research-results` |
| `--events` | `data/events/events.json` |
| `--output` | `data/research-results/event-study.json` |

## Events input schema

```json
[
  { "eventId": "cpi-2026-05", "timestamp": "2026-05-12T12:30:00.000Z", "type": "CPI" }
]
```

## Architecture

```
events.json (--events)
        +
scanCalibrationResearchOutputs(input-dir)
        ↓
extractEventStudyMarketFromResearchOutput
        ↓
assignEventWindows (before | during | after)
        ↓
computeEventStudyEventResult
        ↓
event-study.json
```

- Module: `src/lib/data/research/eventStudy/`
- CLI: `scripts/research/buildEventStudy.ts`

## Per-event outputs

- Markets active in each window
- Average realized volatility, spread, and calibration (Brier / ECE)
- Strategy PnL totals by window (market-level PnL joined to overlapping markets)
- Shifts: before→during, during→after, before→after

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
