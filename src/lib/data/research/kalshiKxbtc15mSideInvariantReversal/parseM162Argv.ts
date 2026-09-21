/**
 * M16.2 CLI argv parser.
 */
import { M16ValidationCollectionError } from "./m16ValidationCohortTypes";

export type ParsedM162Argv = {
  mode:
    | "preflight"
    | "run-daily"
    | "recover"
    | "status"
    | "enable-scheduler"
    | "disable-scheduler";
  dryRun: boolean;
  nowIso: string | null;
  registryDir: string;
  fixtureAdmit: boolean;
};

function optionalFlag(argv: readonly string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  if (idx + 1 >= argv.length) {
    throw new M16ValidationCollectionError(`Flag ${name} requires a value`);
  }
  return argv[idx + 1]!;
}

/**
 * Modes: --preflight | --run-daily | --recover | --status
 *        | --enable-scheduler | --disable-scheduler
 * Optional: --dry-run, --now-iso, --registry-dir, --fixture-admit
 */
export function parseM162Argv(argv: readonly string[]): ParsedM162Argv {
  const modes = [
    ["--preflight", "preflight"],
    ["--run-daily", "run-daily"],
    ["--recover", "recover"],
    ["--status", "status"],
    ["--enable-scheduler", "enable-scheduler"],
    ["--disable-scheduler", "disable-scheduler"],
  ] as const;

  const selected = modes.filter(([flag]) => argv.includes(flag));
  if (selected.length !== 1) {
    throw new M16ValidationCollectionError(
      "Specify exactly one of --preflight | --run-daily | --recover | --status "
        + "| --enable-scheduler | --disable-scheduler",
    );
  }

  const registryDir =
    optionalFlag(argv, "--registry-dir")
    ?? "data/research-results/m16-validation-collection";
  if (registryDir.includes("latest")) {
    throw new M16ValidationCollectionError(
      `mutable latest path forbidden: ${registryDir}`,
    );
  }

  return {
    mode: selected[0]![1],
    dryRun: argv.includes("--dry-run"),
    nowIso: optionalFlag(argv, "--now-iso"),
    registryDir,
    fixtureAdmit: argv.includes("--fixture-admit"),
  };
}
