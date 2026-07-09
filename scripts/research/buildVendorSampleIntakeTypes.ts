import {
  DEFAULT_VENDOR_SAMPLE_INTAKE_HTML_PATH,
  DEFAULT_VENDOR_SAMPLE_INTAKE_OUTPUT_PATH,
  DEFAULT_VENDOR_SAMPLE_INTAKE_ROOT,
  VendorSampleIntakeError,
} from "@/lib/data/research/vendorSampleIntake";

export class VendorSampleIntakeCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorSampleIntakeCommandError";
  }
}

export type VendorSampleIntakeCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new VendorSampleIntakeCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

export function parseVendorSampleIntakeConfigFromArgv(argv: readonly string[]) {
  return {
    outputPath: readFlagValue(argv, "--output", DEFAULT_VENDOR_SAMPLE_INTAKE_OUTPUT_PATH),
    htmlOutputPath: readFlagValue(argv, "--html-output", DEFAULT_VENDOR_SAMPLE_INTAKE_HTML_PATH),
    samplesRoot: readFlagValue(argv, "--samples-root", DEFAULT_VENDOR_SAMPLE_INTAKE_ROOT),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof VendorSampleIntakeCommandError
    || error instanceof VendorSampleIntakeError
  ) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Vendor sample intake failed";
}
