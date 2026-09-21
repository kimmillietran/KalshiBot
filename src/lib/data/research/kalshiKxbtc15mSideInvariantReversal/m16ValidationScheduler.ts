/**
 * M16.2a launchd scheduler helpers — templates + local install/enable.
 * Install via launchctl is explicit/operator-driven; tests never require it.
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

export type M16ValidationSchedulerState = {
  enabled: boolean;
  label: typeof M16_VALIDATION_SCHEDULER_LABEL;
  updatedAtIso: string;
  plistPath: string | null;
  loaded: boolean;
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
 * Generate launchd plist content.
 * Invokes the repo wrapper (sources env + caffeinate + live gate).
 * No secrets embedded. TZ=UTC. Hour=18 Minute=0.
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
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${repo}/${wrapper}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>18</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${repo}/data/research-results/m16-validation-collection/scheduler/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${repo}/data/research-results/m16-validation-collection/scheduler/launchd.err.log</string>
</dict>
</plist>
`;
}

/** Assert generated plist has no secret-like material. */
export function assertM16SchedulerPlistHasNoSecrets(plist: string): void {
  if (/KALSHI_API_KEY_ID\s*=\s*[^\s<]+/.test(plist) && !plist.includes("EnvironmentVariables")) {
    // Allow TZ only; reject embedded key material patterns.
  }
  if (/BEGIN (RSA |EC )?PRIVATE KEY/.test(plist)) {
    throw new M16ValidationCollectionError("plist must not embed private keys");
  }
  if (/api[_-]?key[_-]?id\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{8,}/i.test(plist)) {
    throw new M16ValidationCollectionError("plist must not embed API key ids");
  }
  if (!plist.includes("<string>UTC</string>")) {
    throw new M16ValidationCollectionError("plist must set TZ=UTC");
  }
  if (!plist.includes("<integer>18</integer>")) {
    throw new M16ValidationCollectionError("plist must trigger Hour=18");
  }
}

function statePath(registryDir: string): string {
  return join(registryDir, "scheduler", "state.json");
}

function plistPath(registryDir: string): string {
  return join(registryDir, "scheduler", `${M16_VALIDATION_SCHEDULER_LABEL}.plist`);
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
      + "Wrapper sources load-kalshi-env.sh + caffeinate; no secrets in plist.",
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
  // Best-effort unload of any prior instance.
  spawn("launchctl", ["bootout", service]);
  spawn("launchctl", ["unload", absPlist]);

  const load = spawn("launchctl", ["bootstrap", domain, absPlist]);
  if (load.status !== 0) {
    // Fallback for older macOS.
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
      `Installed via launchctl (${service}). UTC Hour=18. Wrapper uses caffeinate.`,
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
