# M17 — Next experiment queue after CF-v2 SPENT grid HTS (PR #134)

> **RESEARCH PLANNING ONLY — NO NEW STRATEGY P&L IN THIS MEMO**
>
> Does not purchase data, start captures, open sealed M16-P outcomes, or trade.
> Does not freeze a strategy. Paste-ready builder prompt is appended for the
> single recommended next experiment.

| Field | Value |
| --- | --- |
| Memo id | `kalshi-kxbtc15m-m17-next-experiment-queue-v0` |
| Base | `origin/main` after PR #134 merge `87a67a65f58ba9862a488e4b3027be97a65d0edf` |
| Grid study | `kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-exploratory-v0` |

---

## 1. Final disposition — PR #134

| Item | Status |
| --- | --- |
| PR | [#134](https://github.com/kimmillietran/KalshiBot/pull/134) |
| State | **MERGED** 2026-09-26T01:57:55Z |
| Exact head | `c3e9e17610088dd62db25aa43b49d7b25b43c5d4` |
| Merge commit | `87a67a65f58ba9862a488e4b3027be97a65d0edf` |
| Cursor Automation | SUCCESS (exact-head review; no duplicate LRM) |
| Required checks | All SUCCESS |

### Economic result (unchanged; exploratory SPENT)

| Metric | Value |
| --- | ---: |
| N | 321 |
| G | 24 |
| Mean net P&L | **−8.6417¢**/contract |
| CR2 two-sided 95% CI | **[−12.2485, −5.034975]¢** (df = G−1 = 23) |
| Interpretation | `evidence-against-positive-mean` |

### Standing decisions

1. **Stop pursuing grid-entry CF-v2** under the tested specification (first eligible
   retained 60s observation → buy NO → hold to settlement; frozen v2 vol/mid/time
   gates). Negative result survived review and merge.
2. Result is **exploratory SPENT_VALIDATION**, simulated execution at observed
   `noAskCents` — not live fills, not confirmatory, not pristine.
3. **Original continuous-first-crossing CF-v2 remains untested** (see §4 why it is
   not the automatic next test).
4. **M17 settlement-state entry remains paused** (O6 blocked; no `avg_60s_data`
   gates; Path C / no paid BRTI for SPENT backtests).

### Reproducibility (preserve)

```bash
npm run research:calibration-fade-v2-spent-grid-hts-exploratory
```

| Artifact | SHA-256 |
| --- | --- |
| Inputs: preentry-features | `c7bba7a5e2c3ee7b8f5386f770f993752eb3d4053a10ef5f97e6231264b5e0d7` |
| Inputs: settlement-labels | `7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7` |
| `report.json` (at pin commit) | see `…/calibration-fade-v2-spent-grid-hts-exploratory/reproduction.json` |
| Manifest / trades / selected entries | same directory under `data/research-results/external-kalshi-data-audit/` |

No correctness fix was required post-merge; original outputs remain authoritative.

---

## 2. Prior constraints (do not weaken)

| Lineage | Disposition | Constraint on next tests |
| --- | --- | --- |
| CF-v2 continuous crossing | Untested | Untested ≠ automatic next; need timing mechanism (§4) |
| CF-v2 **grid** HTS NO fade | **Stop** (PR #134) | Do not retune vol/mid/time to rescue NO fade |
| M16-ER / M16-P | Fail-to-reject H0 / suspended | Side-invariant reversal spent; sealed M16-P closed |
| M14 momentum validation | `validation-failed` / stop-lineage | No alternate W/X/H, no reversal, no validation-event reuse |
| Lead-lag | Deferred; costly prospective | Not authorized without new budget + OOS |
| TOB-imbalance-v1 TRAIN | Zero eligible candidates | No reverse-direction / neighbor-cell resurrection |
| Settlement-state O3/O6 | Paused / blocked | No SPENT banked-path eval; no `avg_60s` gates |
| Friction coverage (PR #113) | Complete descriptive | RT floor ≈ **4.3¢** at 5/15/30s already measured |
| Favorites / longshots literature | Mixed; horizon-dependent | Short-horizon binary markets often closer to calibrated ([Berg & Rietz IEM](https://www.biz.uiowa.edu/faculty/trietz/papers/Longshots.pdf); [Page & Clemen](https://doi.org/10.1111/j.1468-0297.2012.02561.x)). Kalshi/Polymarket recalibration shows **domain-specific underconfidence** (compression toward 50%), strongest in politics — **crypto 15m transfer is conjectural** ([arxiv:2602.19520](https://arxiv.org/pdf/2602.19520)). |

All 34 days remain **SPENT_VALIDATION**. Exploratory P&L allowed; independent confirmation not.

---

## 3. Ranked candidates (≤3)

### Ranking criteria

1. Mechanism credibility  
2. Difference from failed tests  
3. Execution feasibility  
4. Data availability / cost of an answer  

| Rank | Candidate | Mechanism | Diff from failures | Feasibility | Data | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | **YES underconfidence mirror grid HTS** | Same high-vol / mid / &lt;15m bucket; claim YES is *underpriced* → buy YES | Opposite side of failed NO fade; not a threshold retune | High | Same retained features+labels as #134 | **Recommend first** |
| **2** | **Extreme-favorite HTS (yesMid ≥ 0.85)** | Classic favorite–longshot / underpriced favorites | Different price region than CF mid-band; not M14/M16 | High | Retained ok-book rows; large market count | Optional if #1 stops |
| **3** | Continuous-first-crossing CF-v2 NO fade | Entry at onset of eligibility vs 60s grid | Same direction as #134 failure | Medium (ZIP stream) | RAW ZIPs local | **Do not run now** |

### Candidate 1 — YES underconfidence mirror (recommended)

**Behavior / information difference.** In the frozen late high-vol mid-range
bucket, displayed YES mid may be *compressed toward 50%* relative to settlement
frequencies (underconfidence), so buying YES (not NO) is the economically
opposite claim to CF-v2’s locked “over → NO” rule.

**Why it could persist after fees.** Edge must clear ~2¢ mean STANDARD taker
fee at typical mid-range asks. Only a material frequency gap vs mid survives.

**Prior constraints.** PR #134 rejected **NO** fade in this exact bucket
(mean −8.64¢; CI entirely negative). M14/M16/lead-lag/TOB unrelated. Does **not**
reopen settlement-state.

**Why new, not renamed failure.** Signal side and payoff flip; eligibility gates
unchanged. Not “drop vol,” not “widen band,” not continuous crossing.

**Mechanism status.** Empirically *motivated* by #134’s sign (YES won more often
than a fair NO-fade needs) + public underconfidence patterns on Kalshi-scale
data; **transfer to KXBTC15M 15m is conjectural**. Outcome-informed: **high
prior exposure** — treat as a single predeclared mirror test, not a search.

### Candidate 2 — Extreme-favorite HTS

**Mechanism.** Favorites underpriced (FLB / underconfidence at high prices):
buy YES when `yesMidpoint ≥ 0.85`, hold to settlement.

**Persistence.** Needs settlement frequency above executable YES ask + fee.

**Constraints.** Distinct from mid-band CF. Literature transfer to *ultra-short*
binaries is weak (bias often shrinks near resolution). Feasibility: retained
data has many extreme-mid markets across 34 days (planning census only; no P&L
here).

**Mechanism status.** Documented in longer-horizon prediction-market literature;
**conjectured** for KXBTC15M late window.

### Candidate 3 — Continuous-first-crossing NO fade — **not recommended next**

**Why timing alone is insufficient after #134.** Grid mean was **−8.64¢** with
CI upper **−5.0¢**. First-crossing would need a large, systematic improvement
from entry timing alone. No documented mechanism shows the *onset* of this
bucket is mispriced by enough to overcome that while the 60s grid is not.
Untested status is not enough (per task rules). Revisit only with a
predeclared timing hypothesis (e.g. mid expansion in the first N seconds after
crossing) that does not retune vol/mid/time thresholds.

### Explicitly not queued

| Idea | Why excluded |
| --- | --- |
| Drop vol filter / change mid band to rescue NO | Forbidden auto-promotion; threshold shopping |
| Buy YES *because* NO lost, without frozen mirror spec | Same — only Candidate 1’s bound form is allowed |
| M15 cost-floor rerun | PR #113 already reports ~4.3¢ RT; not a new economic question |
| M14 momentum / M16 reversal / TOB reverse | Stop-lineage / TRAIN-stop / sealed |
| Settlement-state / avg_60s gates | Paused; SPENT lacks banked path |
| Lead-lag prospective | Deferred; needs new capture budget |

---

## 4. Prior-exposure disclosure (Candidate 1)

| Exposure | Detail |
| --- | --- |
| Feature recovery | PR #131 built vol/mid/time features on all 34 SPENT days |
| Grid NO fade | PR #134 ran full exploratory P&L; negative |
| Side choice | YES side chosen **after** observing NO-side failure (outcome-informed) |
| Bound | **One** predeclared mirror: identical gates, buy YES at `yesAskCents`, one fee, HTS |
| Forbidden in the run | Vol ablation, band changes, continuous crossing, multi-cell search |
| Logging | Manifest must list attempted variants = `{mirror-yes-grid-hts-v0}` only |
| Confirmation | Even a positive result is **exploratory SPENT only** — not independent confirmation |

---

## 5. Recommended first experiment (concrete)

**Study ID:** `kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-yes-mirror-exploratory-v0`

| Element | Specification |
| --- | --- |
| Signal | Same as #134 eligibility on `preentry-features.jsonl` |
| Direction | **Buy YES** (not NO) |
| Entry | Earliest eligible `entryTimestampMs` per `marketTicker` |
| Entry price | Observed **`yesAskCents`** |
| Exit | Official settlement `result` |
| Size | 1 contract |
| Fee | One STANDARD taker fee on `yesAskCents` via `computeKalshiScheduleFeeCents` |
| Population | Retained 60s friction-admission grid (same limits as #134) |
| Inputs | Same SHA-pinned features + labels as #134 |
| Stop | `evidence-against-positive-mean` or `observed-economics-do-not-support-proceeding` or insufficient N/G → **stop YES-mirror family**; do not flip bands |
| Promise bar | Same exploratory bar as #134 (`mean≥+1¢`, `G≥15`, CI lower > 0) — screening only |
| Effort | Small (fork #134 runner; flip side/payoff) |
| Runtime | &lt;1 minute offline |
| Positive → later | Only justifies a **fresh-period** independent test design — not pristine open, not live trading |

**Execution limitations (inherit):** simulated quotes; missing quote-age; grid ≠ continuous tape; SPENT only.

---

## 6. Paste-ready builder prompt

```text
Implement and RUN one exploratory experiment on retained M16-ER SPENT data.

## Study
kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-yes-mirror-exploratory-v0

Branch from latest origin/main in an appropriate builder worktree.

## Authorization
Offline simulated P&L at observed quotes is authorized once.
No purchases, downloads, captures, vendor outreach, or live trades.
Do not open sealed M16-P outcomes. Keep M17 settlement-state paused and avg_60s_data out of gates.
Do not modify continuous-first-crossing CF-v2 config.
Do not run vol ablation, mid-band changes, continuous-crossing, or any second variant.

## Prior exposure (mandatory in manifest + report)
PR #134 ran the NO-side grid fade and got mean −8.64¢ with CR2 95% CI entirely below 0.
This YES-side mirror is outcome-informed. Log attemptedVariants=["yes-mirror-grid-hts-v0"] only.
SPENT cannot confirm; exploratory only.

## Inputs (verify SHA-256; fail closed on mismatch)
preentry-features.jsonl
  data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery/work/preentry-features.jsonl
  c7bba7a5e2c3ee7b8f5386f770f993752eb3d4053a10ef5f97e6231264b5e0d7
settlement-labels.jsonl
  data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl
  7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7

## Freeze manifest before outcomes
Reuse CF-v2 gates from
config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json
and PR #134 eligibility:
- bookFeatureStatus=="ok"
- citedHighVolRegime==true (vol contract unchanged)
- yesMidpoint in [1/3, 2/3)
- 0 < timeRemainingMs < 900000
- not crossed/locked; valid finite BBO
- integer yesAskCents in (0,100)
- noAskCents == 100 - yesBidCents (sanity; entry uses yesAsk)
Earliest entryTimestampMs per marketTicker; duplicate conflicts flagged not selected.
Join labels only after selection.

## Payoff
Entry = yesAskCents.
result=="yes": gross = 100 - yesAskCents
result=="no":  gross = -yesAskCents
Subtract one STANDARD taker fee on yesAskCents via computeKalshiScheduleFeeCents
(quantity=1). No exit fee. Call it simulated P&L at observed quotes.

## Inference + interpretation
Same CR2 day-clustered two-sided 95% CI (df=G−1) and exploratory decision rules as PR #134.
Apply data-integrity checks first.

## Deliverables
Frozen manifest, per-market trades, report.json/md, reproduction hashes.
Focused tests; lint/build/full test; one PR; reuse Cursor Automation; no automerge-ok.
Lead with N, G, mean net P&L, CI, interpretation, execution limits, PR link.

## Stop criteria for the family
If interpretation is evidence-against-positive-mean or observed-economics-do-not-support-proceeding
(or insufficient evidence), recommend stopping YES-mirror grid HTS — do not propose
band/vol retunes in the same PR.
```

---

## 7. Attestation

- PR #134 closeout verified merged at exact head; no merge-policy changes.
- No new strategy P&L, purchases, captures, or trades in this planning task.
- Sealed M16-P not opened.
- Continuous-crossing and settlement-state not authorized here.
