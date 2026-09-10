import { MicrostructureFamilyError } from "./microstructureFamilyTypes";

export type ParsedMicrostructureFamilyArgv = {
  outputPath: string | null;
  htmlOutputPath: string | null;
};

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new MicrostructureFamilyError(`Missing value for ${flag}`);
  }
  return value;
}

export function parseMicrostructureFamilyArgv(
  argv: readonly string[],
): ParsedMicrostructureFamilyArgv {
  const forbidden = argv.find(
    (arg) =>
      arg === "--latest"
      || arg === "--mtime"
      || arg === "--use-latest"
      || arg === "--discover"
      || arg === "--rank"
      || arg === "--promote"
      || arg === "--freeze"
      || arg === "--capture"
      || arg === "--live",
  );
  if (forbidden) {
    throw new MicrostructureFamilyError(
      `Forbidden authority flag ${forbidden}: M13.0a is family-definition only `
        + "(no latest/mtime, discovery, promotion, freeze, capture, or live trading).",
    );
  }

  return {
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
  };
}
