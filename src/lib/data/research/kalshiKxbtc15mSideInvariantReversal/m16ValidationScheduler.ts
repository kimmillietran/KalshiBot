/**
 * M16.2b launchd scheduler helpers — California-local dual triggers + UTC gate.
 *
 * Scientific interval remains exactly 18:00–22:00Z (runner-authoritative).
 * launchd StartCalendarInterval uses the Mac *local* clock; child TZ=UTC does
 * NOT rematerialize calendar Hour as UTC. For America/Los_Angeles operators:
 *   local Hour=10 → 18:00Z in PST; exits too-early in PDT
 *   local Hour=11 → 18:00Z in PDT; exits too-late (missed) in PST
 * Nonmatching invocations must not admit/shift a capture.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { M16ValidationCollectionError } from "./m16ValidationCohortTypes";

export const M16_VALIDATION_SCHEDULER_LABEL =
  "com.kalshibot.m16-validation-collection" as const;

export const M16_VALIDATION_SCHEDULER_STATE_DIR_REL =
  "data/research-results/m16-validation-collection/scheduler" as const;

export const M16_VALIDATION_DAILY_WRAPPER_REL =
  "scripts/shell/run-m16-validation-daily.sh" as const;

/** Local calendar hours that can map to 18:00Z under PST/PDT. */
export const M16_LAUNCHD_LOCAL_TRIGGER_HOURS = [10, 11] as const;

export const M16_SCIENTIFIC_WINDOW_UTC = "18:00-22:00Z" as const;

export type M16ValidationSchedulerState = {
  enabled: boolean;
  label: typeof M16_VALIDATION_SCHEDULER_LABEL;
  updatedAtIso: string;
  plistPath: string | null;
  loaded: boolean;
  note: string;
};

export type M16ValidationSchedulerDiagnostics = {
  label: typeof M16_VALIDATION_SCHEDULER_LABEL;
  /** launchctl print succeeded for the service. */
  loaded: boolean;
  /**
   * True only when launchctl reports runs > 0 (job has actually fired at least
   * once). Distinct from "loaded".
   */
  verifiedFired: boolean;
  launchctlRuns: number | null;
  lastExitStatus: string | null;
  wrapperLastInvocationIso: string | null;
  triggerHoursLocal: readonly [10, 11];
  scientificWindowUtc: typeof M16_SCIENTIFIC_WINDOW_UTC;
  childTzUtc: true;
  calendarUsesLocalClock: true;
  note: string;
};

export type M16ValidationSchedulerIo = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: "utf8") => string;
  writeFileSync: (path: string, data: string, encoding: "utf8") => void;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
  nowIso: () => string;
  spawnSync?: (
    command: string,
    args: readonly string[],
  ) => { status: number | null; stdout: string; stderr: string };
};

const DEFAULT_IO: M16ValidationSchedulerIo = {
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  writeFileSync: (path, data, encoding) => writeFileSync(path, data, encoding),
  mkdirSync: (path, opts) => {
    mkdirSync(path, opts);
  },
  nowIso: () => new Date().toISOString(),
  spawnSync: (command, args) => {
    const result = spawnSync(command, [...args], { encoding: "utf8" });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  },
};

/**
 * Map a California local wall-clock hour to UTC hour under fixed offsets.
 * PDT = UTC−7, PST = UTC−8. Used for documentation/tests only — the runner
 * always evaluates eligibility from actual UTC timestamps.
 */
export function mapCaliforniaLocalHourToUtcHour(input: {
  localHour: number;
  offsetHoursWestOfUtc: 7 | 8;
}): number {
  if (!Number.isInteger(input.localHour) || input.localHour < 0 || input.localHour > 23) {
    throw new M16ValidationCollectionError(
      `localHour must be integer 0–23; got ${input.localHour}`,
    );
  }
  return (input.localHour + input.offsetHoursWestOfUtc) % 24;
}

/** PDT (UTC−7): local 11:00 → 18:00Z. */
export function m16PdtLocalHourMapsToScientificStart(localHour: number): boolean {
  return mapCaliforniaLocalHourToUtcHour({
    localHour,
    offsetHoursWestOfUtc: 7,
  }) === 18;
}

/** PST (UTC−8): local 10:00 → 18:00Z. */
export function m16PstLocalHourMapsToScientificStart(localHour: number): boolean {
  return mapCaliforniaLocalHourToUtcHour({
    localHour,
    offsetHoursWestOfUtc: 8,
  }) === 18;
}

/**
 * Generate launchd plist content.
 * Dual local StartCalendarInterval hours 10 and 11 (America/Los_Angeles operator).
 * Child TZ=UTC is for the runner clock only — it does NOT make Hour UTC.
 */
export function generateM16ValidationLaunchdPlist(input: {
  label?: string;
  repoRootPlaceholder?: string;
  wrapperRelPath?: string;
}): string {
  const label = input.label ?? M16_VALIDATION_SCHEDULER_LABEL;
  const repo = input.repoRootPlaceholder ?? "REPO_ROOT";
  const wrapper = input.wrapperRelPath ?? M16_VALIDATION_DAILY_WRAPPER_REL;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>WorkingDirectory</key>
  <string>${repo}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TZ</key>
    <string>UTC</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${repo}/${wrapper}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Hour</key>
      <integer>10</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
    <dict>
      <key>Hour</key>
      <integer>11</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
  </array>
  <key>StandardOutPath</key>
  <string>${repo}/data/research-results/m16-validation-collection/scheduler/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${repo}/data/research-results/m16-validation-collection/scheduler/launchd.err.log</string>
</dict>
</plist>
`;
}

/** Assert generated plist has no secrets and dual local triggers. */
export function assertM16SchedulerPlistHasNoSecrets(plist: string): void {
  if (/BEGIN (RSA |EC )?PRIVATE KEY/.test(plist)) {
    throw new M16ValidationCollectionError("plist must not embed private keys");
  }
  if (/api[_-]?key[_-]?id\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{8,}/i.test(plist)) {
    throw new M16ValidationCollectionError("plist must not embed API key ids");
  }
  if (!plist.includes("<string>UTC</string>")) {
    throw new M16ValidationCollectionError(
      "plist must set child TZ=UTC (runner clock only; not calendar)",
    );
  }
  if (!/<key>StartCalendarInterval<\/key>\s*<array>/.test(plist)) {
    throw new M16ValidationCollectionError(
      "plist must use StartCalendarInterval array (dual local hours)",
    );
  }
  for (const hour of M16_LAUNCHD_LOCAL_TRIGGER_HOURS) {
    if (!plist.includes(`<integer>${hour}</integer>`)) {
      throw new M16ValidationCollectionError(
        `plist must include local trigger Hour=${hour}`,
      );
    }
  }
  // Reject the prior incorrect "Hour=18 is UTC" single-dict design.
  if (
    /<key>StartCalendarInterval<\/key>\s*<dict>[\s\S]*?<integer>18<\/integer>/.test(
      plist,
    )
  ) {
    throw new M16ValidationCollectionError(
      "plist must not use StartCalendarInterval Hour=18 "
        + "(child TZ does not make calendar hours UTC)",
    );
  }
}

function statePath(registryDir: string): string {
  return join(registryDir, "scheduler", "state.json");
}

function plistPath(registryDir: string): string {
  return join(registryDir, "scheduler", `${M16_VALIDATION_SCHEDULER_LABEL}.plist`);
}

function wrapperLogPath(registryDir: string): string {
  return join(registryDir, "scheduler", "wrapper.log");
}

function writeState(
  registryDir: string,
  state: M16ValidationSchedulerState,
  io: M16ValidationSchedulerIo,
): void {
  io.mkdirSync(dirname(statePath(registryDir)), { recursive: true });
  io.writeFileSync(
    statePath(registryDir),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
}

export function enableM16ValidationScheduler(input: {
  registryDir: string;
  io?: M16ValidationSchedulerIo;
  repoRoot?: string;
  labelInstallPath?: string | null;
}): M16ValidationSchedulerState {
  const io = input.io ?? DEFAULT_IO;
  const repo = input.repoRoot ?? "REPO_ROOT";
  const plistContent = generateM16ValidationLaunchdPlist({
    repoRootPlaceholder: repo,
  });
  assertM16SchedulerPlistHasNoSecrets(plistContent);
  const outPlist = plistPath(input.registryDir);
  io.mkdirSync(dirname(outPlist), { recursive: true });
  io.writeFileSync(outPlist, plistContent, "utf8");
  const state: M16ValidationSchedulerState = {
    enabled: true,
    label: M16_VALIDATION_SCHEDULER_LABEL,
    updatedAtIso: io.nowIso(),
    plistPath: input.labelInstallPath ?? outPlist,
    loaded: false,
    note:
      "Local state enabled. Use installM16ValidationLaunchd for launchctl load. "
      + "Dual local Hours 10+11; runner UTC gate remains authoritative. "
      + "Child TZ=UTC does not alter StartCalendarInterval.",
  };
  writeState(input.registryDir, state, io);
  return state;
}

export function disableM16ValidationScheduler(input: {
  registryDir: string;
  io?: M16ValidationSchedulerIo;
}): M16ValidationSchedulerState {
  const io = input.io ?? DEFAULT_IO;
  const prev = statusM16ValidationScheduler(input);
  const state: M16ValidationSchedulerState = {
    ...prev,
    enabled: false,
    updatedAtIso: io.nowIso(),
    note:
      "Disabled in local state. Explicit launchctl bootout/unload is operator-driven.",
  };
  writeState(input.registryDir, state, io);
  return state;
}

export function statusM16ValidationScheduler(input: {
  registryDir: string;
  io?: M16ValidationSchedulerIo;
}): M16ValidationSchedulerState {
  const io = input.io ?? DEFAULT_IO;
  const path = statePath(input.registryDir);
  if (!io.existsSync(path)) {
    return {
      enabled: false,
      label: M16_VALIDATION_SCHEDULER_LABEL,
      updatedAtIso: io.nowIso(),
      plistPath: null,
      loaded: false,
      note: "scheduler never enabled in this registry dir",
    };
  }
  try {
    const parsed = JSON.parse(io.readFileSync(path, "utf8")) as M16ValidationSchedulerState;
    return {
      ...parsed,
      loaded: parsed.loaded ?? false,
    };
  } catch {
    throw new M16ValidationCollectionError(
      `corrupt scheduler state at ${path}`,
    );
  }
}

/**
 * Parse launchctl print output for operational diagnostics.
 * Does not treat mtime as scientific authority.
 */
export function parseM16LaunchctlPrintDiagnostics(printStdout: string): {
  runs: number | null;
  lastExitStatus: string | null;
  loaded: boolean;
} {
  const runsMatch = printStdout.match(/^\s*runs\s*=\s*(\d+)\s*$/m);
  const exitMatch = printStdout.match(/^\s*last exit code\s*=\s*(.+)\s*$/m);
  return {
    loaded: printStdout.includes(M16_VALIDATION_SCHEDULER_LABEL),
    runs: runsMatch ? Number(runsMatch[1]) : null,
    lastExitStatus: exitMatch ? exitMatch[1]!.trim() : null,
  };
}

export function readM16WrapperLastInvocationIso(input: {
  registryDir: string;
  io?: M16ValidationSchedulerIo;
}): string | null {
  const io = input.io ?? DEFAULT_IO;
  const path = wrapperLogPath(input.registryDir);
  if (!io.existsSync(path)) return null;
  try {
    const text = io.readFileSync(path, "utf8");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    const last = lines[lines.length - 1]!;
    const iso = last.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)/);
    if (iso) {
      // Wrapper stamp uses hyphens in time; normalize to ISO for operators.
      return iso[1]!.replace(
        /T(\d{2})-(\d{2})-(\d{2})Z$/,
        (_m, h, mi, s) => `T${h}:${mi}:${s}.000Z`,
      );
    }
    const isoColon = last.match(
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/,
    );
    return isoColon?.[1] ?? null;
  } catch {
    return null;
  }
}

export function diagnoseM16ValidationScheduler(input: {
  registryDir: string;
  io?: M16ValidationSchedulerIo;
  uid?: number;
}): M16ValidationSchedulerDiagnostics {
  const io = input.io ?? DEFAULT_IO;
  const uid = input.uid ?? (typeof process.getuid === "function" ? process.getuid() : 501);
  const spawn = io.spawnSync ?? DEFAULT_IO.spawnSync!;
  const print = spawn("launchctl", [
    "print",
    `gui/${uid}/${M16_VALIDATION_SCHEDULER_LABEL}`,
  ]);
  const parsed = print.status === 0
    ? parseM16LaunchctlPrintDiagnostics(print.stdout)
    : { runs: null, lastExitStatus: null, loaded: false };
  const wrapperLastInvocationIso = readM16WrapperLastInvocationIso({
    registryDir: input.registryDir,
    io,
  });
  const runs = parsed.runs;
  const verifiedFired = typeof runs === "number" && runs > 0;
  return {
    label: M16_VALIDATION_SCHEDULER_LABEL,
    loaded: parsed.loaded,
    verifiedFired,
    launchctlRuns: runs,
    lastExitStatus: parsed.lastExitStatus,
    wrapperLastInvocationIso,
    triggerHoursLocal: [10, 11],
    scientificWindowUtc: M16_SCIENTIFIC_WINDOW_UTC,
    childTzUtc: true,
    calendarUsesLocalClock: true,
    note:
      "loaded ≠ verifiedFired. Calendar Hours 10+11 are local Mac clock; "
      + "scientific eligibility is UTC 18:00–22:00 via runner gate only.",
  };
}

/**
 * Materialize absolute-path plist and launchctl bootstrap/load.
 * Idempotent: bootout then bootstrap.
 */
export function installM16ValidationLaunchd(input: {
  registryDir: string;
  repoRoot: string;
  io?: M16ValidationSchedulerIo;
  uid?: number;
}): M16ValidationSchedulerState {
  const io = input.io ?? DEFAULT_IO;
  const repoRoot = resolve(input.repoRoot);
  const uid = input.uid ?? (typeof process.getuid === "function" ? process.getuid() : 501);
  const domain = `gui/${uid}`;
  const service = `${domain}/${M16_VALIDATION_SCHEDULER_LABEL}`;

  const absPlist = resolve(plistPath(input.registryDir));
  const plistContent = generateM16ValidationLaunchdPlist({
    repoRootPlaceholder: repoRoot,
  });
  assertM16SchedulerPlistHasNoSecrets(plistContent);
  io.mkdirSync(dirname(absPlist), { recursive: true });
  io.writeFileSync(absPlist, plistContent, "utf8");

  const spawn = io.spawnSync ?? DEFAULT_IO.spawnSync!;
  spawn("launchctl", ["bootout", service]);
  spawn("launchctl", ["unload", absPlist]);

  const load = spawn("launchctl", ["bootstrap", domain, absPlist]);
  if (load.status !== 0) {
    const legacy = spawn("launchctl", ["load", "-w", absPlist]);
    if (legacy.status !== 0) {
      throw new M16ValidationCollectionError(
        `launchctl install failed: ${load.stderr || legacy.stderr}`,
      );
    }
  }
  spawn("launchctl", ["enable", service]);

  const state: M16ValidationSchedulerState = {
    enabled: true,
    label: M16_VALIDATION_SCHEDULER_LABEL,
    updatedAtIso: io.nowIso(),
    plistPath: absPlist,
    loaded: true,
    note:
      `Installed via launchctl (${service}). Local Hours 10+11; `
      + `scientific window ${M16_SCIENTIFIC_WINDOW_UTC} via runner. `
      + "Wrapper uses caffeinate.",
  };
  writeState(input.registryDir, state, io);
  return state;
}

export function uninstallM16ValidationLaunchd(input: {
  registryDir: string;
  io?: M16ValidationSchedulerIo;
  uid?: number;
}): M16ValidationSchedulerState {
  const io = input.io ?? DEFAULT_IO;
  const uid = input.uid ?? (typeof process.getuid === "function" ? process.getuid() : 501);
  const domain = `gui/${uid}`;
  const service = `${domain}/${M16_VALIDATION_SCHEDULER_LABEL}`;
  const absPlist = resolve(plistPath(input.registryDir));
  const spawn = io.spawnSync ?? DEFAULT_IO.spawnSync!;
  spawn("launchctl", ["bootout", service]);
  spawn("launchctl", ["unload", absPlist]);
  return disableM16ValidationScheduler(input);
}

export function queryM16ValidationLaunchdLoaded(input: {
  io?: M16ValidationSchedulerIo;
  uid?: number;
}): boolean {
  const io = input.io ?? DEFAULT_IO;
  const uid = input.uid ?? (typeof process.getuid === "function" ? process.getuid() : 501);
  const spawn = io.spawnSync ?? DEFAULT_IO.spawnSync!;
  const result = spawn("launchctl", [
    "print",
    `gui/${uid}/${M16_VALIDATION_SCHEDULER_LABEL}`,
  ]);
  return result.status === 0;
}
