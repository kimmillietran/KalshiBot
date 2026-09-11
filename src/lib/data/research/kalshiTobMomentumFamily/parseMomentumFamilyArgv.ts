import { MomentumFamilyError, type MomentumFamilyDefinitionConfig } from "./momentumFamilyTypes";

function readFlag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new MomentumFamilyError(`Missing value for ${name}`);
  }
  return value;
}

export function parseMomentumFamilyArgv(
  argv: readonly string[],
): MomentumFamilyDefinitionConfig {
  return {
    outputPath: readFlag(argv, "--output"),
    htmlOutputPath: readFlag(argv, "--html-output"),
  };
}
