import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const BASH_WRAPPERS = [
  "run-6h-capture.sh",
  "run-8h-capture.sh",
  "run-capture-restart-smoke.sh",
  "run-capture-reconnect-smoke.sh",
  "audit-latest-capture.sh",
] as const;

describe("operator Bash wrappers", () => {
  for (const wrapper of BASH_WRAPPERS) {
    it(`${wrapper} passes bash -n`, () => {
      const result = spawnSync("bash", ["-n", join(ROOT, wrapper)], {
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    });

    it(`${wrapper} is executable and forwards arguments via exec`, () => {
      const path = join(ROOT, wrapper);
      accessSync(path, constants.X_OK);
      const mode = statSync(path).mode;
      expect(mode & 0o111).toBeTruthy();

      const source = readFileSync(path, "utf8");
      expect(source.startsWith("#!/usr/bin/env bash")).toBe(true);
      expect(source).toContain('ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"');
      expect(source).toContain('cd "${ROOT}"');
      expect(source).toContain('exec npx tsx');
      expect(source).toContain('"$@"');
      expect(source).not.toMatch(/powershell|pwsh|Start-Job/i);
    });
  }

  it("quotes repository paths so spaces in ROOT are preserved", () => {
    for (const wrapper of BASH_WRAPPERS) {
      const source = readFileSync(join(ROOT, wrapper), "utf8");
      expect(source).toContain('cd "${ROOT}"');
      expect(source).not.toContain("cd ${ROOT}");
    }
  });
});
