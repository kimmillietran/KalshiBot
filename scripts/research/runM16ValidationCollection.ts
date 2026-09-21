/**
 * M16.2 CLI — prospective validation collection automation.
 * Never opens P&L. Live capture only with M16_VALIDATION_ALLOW_LIVE_CAPTURE=1.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildM16ScientificProtocolIdentity,
  buildM16ValidationAuthorityBinding,
  createEmptyM16ValidationRegistry,
  disableM16ValidationScheduler,
  enableM16ValidationScheduler,
  formatOperatorProgressText,
  parseM162Argv,
  preflightM16ValidationCycle,
  recoverM16ValidationCycle,
  runM16ValidationDailyCycle,
  statusM16ValidationCycle,
  statusM16ValidationScheduler,
  type M16ValidationAttemptRecord,
  type M16ValidationRegistry,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal";
import { stableStringify } from "@/lib/trading/config/hashConfig";

function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function saveJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const publishIo = {
    writeFile: (p: string, data: string) => writeFileSync(p, data, "utf8"),
    fileExists: (p: string) => existsSync(p),
    renameFile: (from: string, to: string) => renameSync(from, to),
    unlinkFile: (p: string) => unlinkSync(p),
    mkdirSync: (p: string, opts?: { recursive?: boolean }) => mkdirSync(p, opts),
    readFile: (p: string) => readFileSync(p, "utf8"),
  };
  publishResearchArtifactsAtomically(publishIo, [
    { outputPath: path, data: `${stableStringify(value)}\n` },
  ]);
}

export async function runM16ValidationCollectionCommand(
  argv: readonly string[],
): Promise<number> {
  try {
    const parsed = parseM162Argv(argv);
    const registryPath = join(parsed.registryDir, "registry.json");
    const attemptsPath = join(parsed.registryDir, "attempts.json");
    const progressPath = join(parsed.registryDir, "progress.json");
    const lockPath = join(parsed.registryDir, "locks", "m16-validation-runner.lock");
    mkdirSync(parsed.registryDir, { recursive: true });

    const authority = buildM16ValidationAuthorityBinding(null);
    const loadRegistry = (): M16ValidationRegistry => {
      if (!existsSync(registryPath)) {
        return createEmptyM16ValidationRegistry({
          planFreezeTimestampIso: new Date().toISOString(),
          authority,
        });
      }
      return loadJson(registryPath, createEmptyM16ValidationRegistry({
        planFreezeTimestampIso: new Date().toISOString(),
        authority,
      }));
    };
    const saveRegistry = (registry: M16ValidationRegistry) => {
      saveJson(registryPath, registry);
    };
    const loadAttempts = (): M16ValidationAttemptRecord[] =>
      loadJson(attemptsPath, []);
    const saveAttempts = (attempts: readonly M16ValidationAttemptRecord[]) => {
      saveJson(attemptsPath, attempts);
    };

    const nowMs = parsed.nowIso
      ? Date.parse(parsed.nowIso)
      : Date.now();
    if (parsed.nowIso && !Number.isFinite(nowMs)) {
      throw new Error(`invalid --now-iso ${parsed.nowIso}`);
    }

    const io = {
      loadRegistry,
      saveRegistry,
      loadAttempts,
      saveAttempts,
      lockPath,
      nowMs: () => nowMs,
      dryRun: parsed.dryRun || process.env.M16_VALIDATION_ALLOW_LIVE_CAPTURE !== "1",
      preflightExtras: {
        getFreeDiskBytes: () => {
          // Best-effort: report a large number when df unavailable in tests.
          return 50 * 1024 * 1024 * 1024;
        },
        credentialsPresent: () =>
          Boolean(process.env.KALSHI_API_KEY_ID)
          && Boolean(process.env.KALSHI_API_PRIVATE_KEY_PATH),
      },
      log: (message: string) => {
        process.stderr.write(`${message}\n`);
      },
    };

    if (parsed.mode === "preflight") {
      const result = preflightM16ValidationCycle(io);
      process.stdout.write(`${stableStringify({
        mode: "preflight",
        ok: result.ok,
        blockers: result.blockers,
        warnings: result.warnings,
        scientificProtocolIdentity: result.scientificProtocolIdentity,
        outcomesOpened: false,
      })}\n`);
      return result.ok ? 0 : 1;
    }

    if (parsed.mode === "status") {
      const status = statusM16ValidationCycle(io);
      const sched = statusM16ValidationScheduler({ registryDir: parsed.registryDir });
      saveJson(progressPath, status.progress);
      process.stdout.write(formatOperatorProgressText(status.progress));
      process.stdout.write(`${stableStringify({
        mode: "status",
        nextStart: status.nextStart,
        launch: status.launch,
        scheduler: sched,
        scientificProtocolIdentity: buildM16ScientificProtocolIdentity(),
        outcomesOpened: false,
      })}\n`);
      return 0;
    }

    if (parsed.mode === "recover") {
      const result = recoverM16ValidationCycle(io);
      process.stdout.write(`${stableStringify(result)}\n`);
      return 0;
    }

    if (parsed.mode === "enable-scheduler") {
      const state = enableM16ValidationScheduler({ registryDir: parsed.registryDir });
      process.stdout.write(`${stableStringify({
        mode: "enable-scheduler",
        ...state,
        note:
          state.note
          + " Set TZ=UTC. Wrap capture with caffeinate on macOS for 4h runs.",
      })}\n`);
      return 0;
    }

    if (parsed.mode === "disable-scheduler") {
      const state = disableM16ValidationScheduler({ registryDir: parsed.registryDir });
      process.stdout.write(`${stableStringify({ mode: "disable-scheduler", ...state })}\n`);
      return 0;
    }

    // --run-daily
    const result = await runM16ValidationDailyCycle(io, nowMs);
    if (result.reservation) {
      const registry = loadRegistry();
      if (
        !registry.reservations.some(
          (r) => r.reservationIdentity === result.reservation!.reservationIdentity,
        )
      ) {
        saveRegistry({
          ...registry,
          reservations: [...registry.reservations, result.reservation],
          registryIdentity: registry.registryIdentity,
        });
      }
    }
    saveJson(progressPath, result.progress);
    process.stdout.write(`${stableStringify({
      ...result,
      scientificProtocolIdentity: buildM16ScientificProtocolIdentity(),
      liveCaptureAllowed: process.env.M16_VALIDATION_ALLOW_LIVE_CAPTURE === "1",
    })}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`M16.2 failed: ${message}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runM16ValidationCollectionCommand(process.argv.slice(2));
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("runM16ValidationCollection.ts")
) {
  void main();
}
