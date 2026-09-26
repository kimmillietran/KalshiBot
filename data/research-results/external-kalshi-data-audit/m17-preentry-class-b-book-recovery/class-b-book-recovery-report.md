# M17 pre-entry Class B book-recovery validation

**Status: admission-time BBO reconstruction remains `uncertain`.**

## Why this run did not replay RAW ZIPs

Retained CryptoStruct inputs required for the targeted Class B replay were
**not present** in this cloud environment:

| Input | Expected path | Present |
| --- | --- | --- |
| Friction samples | `data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl` | no |
| Book features | `…/m17-preentry-feature-recovery/work/book-features.jsonl` | no |
| RAW day ZIPs (34) | `data/external-samples/cryptostruct/m16-er/raw/` | no |

Expected checksums (from merged PR #131 report) were **not** re-hashed here
because the files are absent. No purchase, network market-data request, new
capture, or full 34-day recovery was started.

## Prior diagnostic (not re-verified here)

| Class | Count | Meaning |
| --- | ---: | --- |
| Half-spread mismatches (PR #131) | 308 | Regenerated vs retained `entryHalfSpreadCents` |
| Class A — definition | 249 | Half-spread differs; executable NO ask (`100 − YES bid`) reported stable |
| Class B — recovery uncertainty | 59 | Remaining rows needing admission-time BBO confirmation |

Class A stays distinct. This task does **not** treat Class A as a book-recovery
failure.

## Classifier added for when inputs are available

`classifyHalfSpreadMismatches.ts` (hermetic tests included) implements the
Class A / Class B split for mismatch rows **enriched** with an explicit
retained executable NO ask (samples join). `book-features.jsonl` alone does
**not** carry `retainedExecutableNoAskCents`; without that field the
classifier fails closed into Class B and will not reproduce the cited 249/59
split. No live requests. Targeted RAW replay for Class B is still required on
a machine that holds the gitignored ZIPs before Class B can move off
`uncertain`.

## Feature coverage

Committed PR #131 coverage is unchanged: `bookOk=47281`,
`halfSpreadMismatch=308`, `marketTimeVolComplete=47281`. No coverage rewrite.
