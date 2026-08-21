import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface CandidateFileMetadata {
  targetPath: string;
  snapshotPath: string;
  state: 'opened' | 'staged' | 'accepted' | 'rolled_back';
}

/**
 * A crash-recoverable, same-directory candidate writer. The original is held
 * as bytes, not text, which makes rollback safe for legacy encodings as well.
 */
export class CandidateFile {
  private state: CandidateFileMetadata['state'] = 'opened';

  private constructor(readonly targetPath: string, readonly snapshotPath: string, private readonly metadataPath: string) {}

  static async open(targetPath: string, artifactDirectory?: string): Promise<CandidateFile> {
    const absolute = path.resolve(targetPath);
    const directory = artifactDirectory ? path.resolve(artifactDirectory) : path.join(path.dirname(absolute), '.qt-ui-copilot-candidates');
    await mkdir(directory, { recursive: true });
    const id = randomUUID();
    const snapshotPath = path.join(directory, `${path.basename(absolute)}.${id}.original`);
    await copyFile(absolute, snapshotPath);
    const file = new CandidateFile(absolute, snapshotPath, `${snapshotPath}.json`);
    await file.persist();
    return file;
  }

  async stage(candidate: string | Uint8Array): Promise<void> {
    if (this.state === 'accepted') throw new Error('Cannot stage an accepted candidate');
    const temporary = path.join(path.dirname(this.targetPath), `.${path.basename(this.targetPath)}.${randomUUID()}.candidate`);
    try {
      await writeFile(temporary, candidate);
      await rename(temporary, this.targetPath);
      this.state = 'staged';
      await this.persist();
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async accept(approval: { approved: boolean }): Promise<void> {
    if (this.state !== 'staged') throw new Error('Only a staged candidate can be accepted');
    if (!approval.approved) throw new Error('Candidate acceptance requires explicit user approval');
    this.state = 'accepted';
    await this.persist();
    await rm(this.snapshotPath, { force: true });
  }

  async rollback(): Promise<void> {
    if (this.state === 'accepted') throw new Error('Cannot roll back an accepted candidate');
    if (this.state === 'rolled_back') return;
    const original = await readFile(this.snapshotPath);
    const temporary = path.join(path.dirname(this.targetPath), `.${path.basename(this.targetPath)}.${randomUUID()}.rollback`);
    try {
      await writeFile(temporary, original);
      await rename(temporary, this.targetPath);
      this.state = 'rolled_back';
      await this.persist();
    } finally {
      await rm(temporary, { force: true });
    }
  }

  metadata(): CandidateFileMetadata {
    return { targetPath: this.targetPath, snapshotPath: this.snapshotPath, state: this.state };
  }

  private async persist(): Promise<void> {
    await writeFile(this.metadataPath, JSON.stringify(this.metadata()), 'utf8');
  }
}
