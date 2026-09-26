/**
 * Stream CryptoStruct .txt.zst (and ZIP members) line-by-line without loading whole days.
 * Uses system `zstd` / `unzip` for decompress (portable; avoids incomplete @types/node zlib).
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";

export async function hashFileSha256(path: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function forEachLineFromReadable(
  readable: Readable,
  onLine: (line: string) => void | Promise<void>,
): Promise<void> {
  const rl = createInterface({ input: readable, crlfDelay: Infinity });
  // Prefer sync path: awaiting every line creates per-line microtasks and GC pressure.
  for await (const line of rl) {
    const result = onLine(line);
    if (result !== undefined && typeof (result as Promise<void>).then === "function") {
      await result;
    }
  }
}

function spawnChecked(command: string, args: string[]): ReturnType<typeof spawn> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  return child;
}

async function awaitChild(child: ReturnType<typeof spawn>, label: string): Promise<void> {
  const errChunks: Buffer[] = [];
  child.stderr?.on("data", (c: Buffer) => errChunks.push(c));
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${label} failed (${code}): ${Buffer.concat(errChunks).toString("utf8")}`,
          ),
        );
      }
    });
  });
}

/** Stream a standalone .txt.zst tick file. */
export async function streamZstdTextFile(
  path: string,
  onLine: (line: string) => void | Promise<void>,
): Promise<void> {
  if (!existsSync(path)) {
    throw new Error(`missing tick file: ${path}`);
  }
  assertZstdAvailable();
  const child = spawnChecked("zstd", ["-dc", path]);
  const lineDone = forEachLineFromReadable(child.stdout as Readable, onLine);
  await Promise.all([lineDone, awaitChild(child, `zstd -dc ${path}`)]);
}

/**
 * Stream one ZIP member that is itself .txt.zst via `unzip -p | zstd -dc`.
 */
export async function streamZipMemberZstd(
  zipPath: string,
  memberName: string,
  onLine: (line: string) => void | Promise<void>,
): Promise<void> {
  if (!existsSync(zipPath)) {
    throw new Error(`missing zip: ${zipPath}`);
  }
  assertZstdAvailable();
  const unzip = spawnChecked("unzip", ["-p", zipPath, memberName]);
  const zstd = spawn("zstd", ["-dc"], { stdio: ["pipe", "pipe", "pipe"] });
  unzip.stdout!.pipe(zstd.stdin!);

  const unzipErr: Buffer[] = [];
  const zstdErr: Buffer[] = [];
  unzip.stderr?.on("data", (c: Buffer) => unzipErr.push(c));
  zstd.stderr?.on("data", (c: Buffer) => zstdErr.push(c));

  const lineDone = forEachLineFromReadable(zstd.stdout as Readable, onLine);
  const exits = Promise.all([
    new Promise<void>((resolve, reject) => {
      unzip.on("error", reject);
      unzip.on("close", (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `unzip -p failed (${code}) for ${memberName}: ${Buffer.concat(unzipErr).toString("utf8")}`,
            ),
          );
        }
      });
    }),
    new Promise<void>((resolve, reject) => {
      zstd.on("error", reject);
      zstd.on("close", (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `zstd -dc failed (${code}): ${Buffer.concat(zstdErr).toString("utf8")}`,
            ),
          );
        }
      });
    }),
  ]);
  await Promise.all([lineDone, exits]);
}

/**
 * Peek the first decompressed line of a ZIP .txt.zst member (header JSON).
 * Bounded: stops after one line via `head -n 1` so full members are not read.
 */
export function peekZipMemberFirstLine(
  zipPath: string,
  memberName: string,
): string | null {
  if (!existsSync(zipPath)) {
    throw new Error(`missing zip: ${zipPath}`);
  }
  assertZstdAvailable();
  const result = spawnSync(
    "bash",
    [
      "-lc",
      `unzip -p "$1" "$2" | zstd -dc | head -n 1`,
      "peek",
      zipPath,
      memberName,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }
  // head may SIGPIPE zstd/unzip; accept empty or partial with status 0/1/141
  const line = (result.stdout ?? "").split("\n")[0]?.trim() ?? "";
  return line.length > 0 ? line : null;
}

/** List member names inside a ZIP (via unzip -Z1). */
export async function listZipMembers(zipPath: string): Promise<string[]> {
  return await new Promise((resolve, reject) => {
    const child = spawnChecked("unzip", ["-Z1", zipPath]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout!.on("data", (c: Buffer) => out.push(c));
    child.stderr!.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`unzip -Z1 failed: ${Buffer.concat(err).toString("utf8")}`));
        return;
      }
      const text = Buffer.concat(out).toString("utf8");
      resolve(text.split("\n").map((s) => s.trim()).filter(Boolean));
    });
  });
}

/** Require system `zstd` (used for .txt.zst streaming + fixtures). */
export function assertZstdAvailable(): void {
  const probe = spawnSync("zstd", ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    throw new Error(
      "System `zstd` is required for CryptoStruct .txt.zst streaming "
        + "(install via apt/brew). "
        + (probe.error?.message ?? probe.stderr ?? "zstd --version failed"),
    );
  }
}

/** Write a tiny native .txt.zst fixture from lines (for tests). */
export async function writeZstdTextFixture(
  path: string,
  lines: readonly string[],
): Promise<void> {
  assertZstdAvailable();
  const body = `${lines.join("\n")}\n`;
  const tmpPlain = `${path}.plain`;
  writeFileSync(tmpPlain, body, "utf8");
  try {
    const result = spawnSync("zstd", ["-q", "-f", "-o", path, tmpPlain], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(
        `zstd compress failed: ${result.stderr || result.error?.message || `exit ${result.status}`}`,
      );
    }
  } finally {
    try {
      unlinkSync(tmpPlain);
    } catch {
      // ignore
    }
  }
}
