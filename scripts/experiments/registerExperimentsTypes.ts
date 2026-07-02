export class RegisterExperimentsCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterExperimentsCommandError";
  }
}

export type RegisterExperimentsCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  resolveGitCommit?: () => string | null;
};

function parseFlagValue(
  argv: readonly string[],
  flag: string,
  label: string,
  defaultValue: string,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new RegisterExperimentsCommandError(`Missing value for ${label}`);
      }
      return next;
    }
  }

  return defaultValue;
}

export function parseResearchRootFromArgv(
  argv: readonly string[],
  defaultDir = "data/research-results",
): string {
  return parseFlagValue(argv, "--research-root", "--research-root <path>", defaultDir);
}

export function parseExperimentsRootFromArgv(
  argv: readonly string[],
  defaultDir = "data/experiments",
): string {
  return parseFlagValue(argv, "--experiments-root", "--experiments-root <path>", defaultDir);
}

export function parseFixturesRootFromArgv(
  argv: readonly string[],
  defaultDir = "data/fixtures",
): string {
  return parseFlagValue(argv, "--fixtures-root", "--fixtures-root <path>", defaultDir);
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
