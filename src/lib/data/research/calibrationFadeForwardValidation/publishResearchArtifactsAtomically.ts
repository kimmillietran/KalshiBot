type ArtifactPublish = { outputPath: string; data: string };
type PreparedArtifactPublish = ArtifactPublish & {
  tempPath: string;
  backupPath: string;
  backupCreated: boolean;
  committed: boolean;
};

type PublishIo = {
  writeFile: (path: string, data: string) => void;
  fileExists: (path: string) => boolean;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

function cleanupIfPresent(io: PublishIo, path: string): void {
  if (io.fileExists(path)) {
    io.unlinkFile(path);
  }
}

function rollbackPublishedArtifacts(io: PublishIo, artifacts: readonly PreparedArtifactPublish[]): void {
  for (const artifact of [...artifacts].reverse()) {
    if (artifact.committed) {
      cleanupIfPresent(io, artifact.outputPath);
    }
    if (artifact.backupCreated && io.fileExists(artifact.backupPath)) {
      io.renameFile(artifact.backupPath, artifact.outputPath);
    }
    cleanupIfPresent(io, artifact.tempPath);
  }
}

/** Atomically publishes multiple research artifacts with rollback on failure. */
export function publishResearchArtifactsAtomically(
  io: PublishIo,
  artifacts: readonly ArtifactPublish[],
  pid: number = process.pid,
): void {
  const preparedArtifacts = artifacts.map((artifact, index) => ({
    ...artifact,
    tempPath: `${artifact.outputPath}.${pid}.${index}.tmp`,
    backupPath: `${artifact.outputPath}.${pid}.${index}.bak`,
    backupCreated: false,
    committed: false,
  }));

  try {
    for (const artifact of preparedArtifacts) {
      io.writeFile(artifact.tempPath, artifact.data);
    }
    for (const artifact of preparedArtifacts) {
      if (io.fileExists(artifact.outputPath)) {
        io.renameFile(artifact.outputPath, artifact.backupPath);
        artifact.backupCreated = true;
      }
      io.renameFile(artifact.tempPath, artifact.outputPath);
      artifact.committed = true;
    }
    for (const artifact of preparedArtifacts) {
      if (artifact.backupCreated) {
        cleanupIfPresent(io, artifact.backupPath);
      }
    }
  } catch (error) {
    rollbackPublishedArtifacts(io, preparedArtifacts);
    throw error;
  }
}
