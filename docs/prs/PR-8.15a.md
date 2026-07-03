# PR 8.15A — Strategy Synthesis Engine

## Purpose

Convert validated hypothesis candidates into parameterized, read-only strategy specifications researchers can review before any execution work.

## Usage

```bash
npm run research:strategy-synthesis
```

## Inputs

- `hypothesis-candidates.json`
- `hypothesis-validation.json`

## Output

`strategy-synthesis-candidates.json` with synthesized strategy specs including direction, entry conditions, promotion status, and risk notes.

## Constraints

Read-only synthesis layer. Does **not** modify replay, strategy execution, sweep, or leaderboard behavior.
