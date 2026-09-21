/**
 * M16.2 launchd scheduler helpers — templates + local state only.
 * Install via launchctl is explicit/operator-driven; tests never require it.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { M16ValidationCollectionError } from "./m16ValidationCohortTypes";

export const M16_VALIDATION_SCHEDULER_LABEL =
  "com.kalshibot.m16-validation-collection" as const;

export const M16_VALIDATION_SCHEDULER_STATE_DIR_REL =
  "data/research-results/m16-validation-collection/scheduler" as const;

export type M16ValidationSchedulerState = {
  enabled: boolean;
  label: typeof M16_VALIDATION_SCHEDULER_LABEL;
  updatedAtIso: string;
  plistPath: string | null;
  note: string;
};

export type M16ValidationSchedulerIo = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: "utf8") => string;
  writeFileSync: (path: string, data: string, encoding: "utf8") => void;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
  nowIso: () => string;
};

const DEFAULT_IO: M16ValidationSchedulerIo = {
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  writeFileSync: (path, data, encoding) => writeFileSync(path, data, encoding),
  mkdirSync: (path, opts) => {
    mkdirSync(path, opts);
  },
  nowIso: () => new Date().toISOString(),
};

/**
 * Generate launchd plist content.
 * Uses REPO_ROOT placeholder — no machine-specific home paths.
 * StartCalendarInterval Hour=18 Minute=0 (UTC when TZ=UTC in the job env).
 */
export function generateM16ValidationLaunchdPlist(input: {
  label?: string;
  repoRootPlaceholder?: string;
  npmScript?: string;
}): string {
  const label = input.label ?? M16_VALIDATION_SCHEDULER_LABEL;
  const repo = input.repoRootPlaceholder ?? "REPO_ROOT";
  const script = input.npmScript ?? "research:m16-validation-collection";
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
    <string>/usr/bin/env</string>
    <string>npm</string>
    <string>run</string>
    <string>${script}</string>
    <string>--</string>
    <string>--run-daily</string>
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

function statePath(registryDir: string): string {
  return join(registryDir, "scheduler", "state.json");
}

function plistPath(registryDir: string): string {
  return join(registryDir, "scheduler", `${M16_VALIDATION_SCHEDULER_LABEL}.plist`);
}

export function enableM16ValidationScheduler(input: {
  registryDir: string;
  io?: M16ValidationSchedulerIo;
  /** Optional absolute Label / plist install path hint (not required for tests). */
  labelInstallPath?: string | null;
}): M16ValidationSchedulerState {
  const io = input.io ?? DEFAULT_IO;
  const plistContent = generateM16ValidationLaunchdPlist({});
  const outPlist = plistPath(input.registryDir);
  io.mkdirSync(dirname(outPlist), { recursive: true });
  io.writeFileSync(outPlist, plistContent, "utf8");
  const state: M16ValidationSchedulerState = {
    enabled: true,
    label: M16_VALIDATION_SCHEDULER_LABEL,
    updatedAtIso: io.nowIso(),
    plistPath: input.labelInstallPath ?? outPlist,
    note:
      "Local state only. Install is explicit: copy plist and run launchctl load. "
      + "Replace REPO_ROOT before install. Do not commit machine home paths.",
  };
  io.writeFileSync(statePath(input.registryDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
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
      "Disabled in local state. Explicit launchctl unload is operator-driven.",
  };
  io.mkdirSync(dirname(statePath(input.registryDir)), { recursive: true });
  io.writeFileSync(statePath(input.registryDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
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
      note: "scheduler never enabled in this registry dir",
    };
  }
  try {
    return JSON.parse(io.readFileSync(path, "utf8")) as M16ValidationSchedulerState;
  } catch {
    throw new M16ValidationCollectionError(
      `corrupt scheduler state at ${path}`,
    );
  }
}
