export class CalibrationFadeFamilyVerdictCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeFamilyVerdictCommandError";
  }
}

export type CalibrationFadeFamilyVerdictCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof CalibrationFadeFamilyVerdictCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Calibration-fade family verdict failed";
}
