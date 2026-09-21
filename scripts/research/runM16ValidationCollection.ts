/**
 * M16.2a CLI — prospective validation collection automation.
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
import { dirname, join, resolve } from "node:path";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildM16ScientificProtocolIdentity,
  buildM16ValidationAuthorityBinding,
  createEmptyM16ValidationRegistry,
  disableM16ValidationScheduler,
  enableM16ValidationScheduler,
  formatOperatorProgressText,
  getFreeDiskBytesForPath,
  installM16ValidationLaunchd,
  isM16LiveCaptureAllowed,
  launchM16CanonicalForwardQuoteCapture,
  parseM162Argv,
  preflightM16ValidationCycle,
  queryM16ValidationLaunchdLoaded,
  recoverM16ValidationCycle,
  runM16ValidationDailyCycle,
  statusM16ValidationCycle,
  statusM16ValidationScheduler,
  diagnoseM16ValidationScheduler,
  uninstallM16ValidationLaunchd,
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

function appendSchedulerLog(registryDir: string, line: string): void {
  const logPath = join(registryDir, "scheduler", "ops.log");
  mkdirSync(dirname(logPath), { recursive: true });
  // Never log secrets / P&L.
  if (/PRIVATE KEY|api[_-]?key|secret/i.test(line)) return;
  writeFileSync(logPath, `${new Date().toISOString()} ${line}\n`, { flag: "a" });
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

    const liveAllowed = isM16LiveCaptureAllowed();
    const io = {
      loadRegistry,
      saveRegistry,
      loadAttempts,
      saveAttempts,
      lockPath,
      nowMs: () => nowMs,
      dryRun: parsed.dryRun || !liveAllowed,
      registryDir: parsed.registryDir,
      captureLauncher: liveAllowed && !parsed.dryRun
        ? launchM16CanonicalForwardQuoteCapture
        : undefined,
      preflightExtras: {
        getFreeDiskBytes: () => getFreeDiskBytesForPath(parsed.registryDir),
        credentialsPresent: () =>
          Boolean(process.env.KALSHI_API_KEY_ID)
          && Boolean(process.env.KALSHI_API_PRIVATE_KEY_PATH),
      },
      log: (message: string) => {
        process.stderr.write(`${message}\n`);
        appendSchedulerLog(parsed.registryDir, message);
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
        liveCaptureAllowed: liveAllowed,
        outcomesOpened: false,
      })}\n`);
      return result.ok ? 0 : 1;
    }

    if (parsed.mode === "status") {
      const status = statusM16ValidationCycle(io);
      const sched = statusM16ValidationScheduler({ registryDir: parsed.registryDir });
      const diagnostics = diagnoseM16ValidationScheduler({
        registryDir: parsed.registryDir,
      });
      saveJson(progressPath, status.progress);
      process.stdout.write(
        formatOperatorProgressText(status.progress, {
          schedulerEnabled: sched.enabled,
        }),
      );
      process.stdout.write(`${stableStringify({
        mode: "status",
        nextStart: status.nextStart,
        launch: status.launch,
        scheduler: sched,
        schedulerDiagnostics: diagnostics,
        scientificProtocolIdentity: buildM16ScientificProtocolIdentity(),
        outcomesOpened: false,
      })}\n`);
      return 0;
    }

    if (parsed.mode === "recover") {
      const result = await recoverM16ValidationCycle({
        ...io,
        lockPath,
      });
      saveJson(progressPath, result.progress);
      process.stdout.write(`${stableStringify(result)}\n`);
      return 0;
    }

    if (parsed.mode === "enable-scheduler") {
      const state = enableM16ValidationScheduler({
        registryDir: parsed.registryDir,
        repoRoot: resolve("."),
      });
      process.stdout.write(`${stableStringify({
        mode: "enable-scheduler",
        ...state,
      })}\n`);
      return 0;
    }

    if (parsed.mode === "disable-scheduler") {
      const state = disableM16ValidationScheduler({ registryDir: parsed.registryDir });
      process.stdout.write(`${stableStringify({ mode: "disable-scheduler", ...state })}\n`);
      return 0;
    }

    if (parsed.mode === "install-scheduler") {
      const state = installM16ValidationLaunchd({
        registryDir: parsed.registryDir,
        repoRoot: resolve("."),
      });
      const loaded = queryM16ValidationLaunchdLoaded({});
      process.stdout.write(`${stableStringify({
        mode: "install-scheduler",
        ...state,
        launchctlLoaded: loaded,
      })}\n`);
      return 0;
    }

    if (parsed.mode === "uninstall-scheduler") {
      const state = uninstallM16ValidationLaunchd({
        registryDir: parsed.registryDir,
      });
      process.stdout.write(`${stableStringify({
        mode: "uninstall-scheduler",
        ...state,
      })}\n`);
      return 0;
    }

    // --run-daily
    appendSchedulerLog(
      parsed.registryDir,
      `run-daily start live=${liveAllowed} dryRun=${io.dryRun}`,
    );
    const result = await runM16ValidationDailyCycle(io, nowMs);
    // Reservation already persisted inside lifecycle before capture.
    // Keep progress snapshot deterministic.
    saveJson(progressPath, result.progress);
    appendSchedulerLog(
      parsed.registryDir,
      `run-daily done launched=${result.captureLaunched} `
        + `admitted=${result.admitted} excluded=${result.excluded} `
        + `disposition=${result.progress.disposition} `
        + `hours=${result.progress.acceptedHours} `
        + `trades=${result.progress.eligibleTradeCount}`,
    );
    process.stdout.write(`${stableStringify({
      ...result,
      scientificProtocolIdentity: buildM16ScientificProtocolIdentity(),
      liveCaptureAllowed: liveAllowed,
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
