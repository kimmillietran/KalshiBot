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
    | "disable-scheduler"
    | "install-scheduler"
    | "uninstall-scheduler";
  dryRun: boolean;
  nowIso: string | null;
  registryDir: string;
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
 *        | --install-scheduler | --uninstall-scheduler
 * Optional: --dry-run, --now-iso, --registry-dir
 * --fixture-admit is rejected (no arbitrary admit of unrelated captures).
 */
export function parseM162Argv(argv: readonly string[]): ParsedM162Argv {
  if (argv.includes("--fixture-admit")) {
    throw new M16ValidationCollectionError(
      "--fixture-admit is not supported; use governed --run-daily / --recover only",
    );
  }

  const modes = [
    ["--preflight", "preflight"],
    ["--run-daily", "run-daily"],
    ["--recover", "recover"],
    ["--status", "status"],
    ["--enable-scheduler", "enable-scheduler"],
    ["--disable-scheduler", "disable-scheduler"],
    ["--install-scheduler", "install-scheduler"],
    ["--uninstall-scheduler", "uninstall-scheduler"],
  ] as const;

  const selected = modes.filter(([flag]) => argv.includes(flag));
  if (selected.length !== 1) {
    throw new M16ValidationCollectionError(
      "Specify exactly one of --preflight | --run-daily | --recover | --status "
        + "| --enable-scheduler | --disable-scheduler "
        + "| --install-scheduler | --uninstall-scheduler",
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
  };
}
