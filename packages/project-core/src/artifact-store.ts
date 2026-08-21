import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export class ArtifactStore {
  public readonly root: string;

  public constructor(root: string) {
    this.root = path.resolve(root);
  }

  public resolve(relativePath: string): string {
    const absolute = path.resolve(this.root, relativePath);
    if (absolute === this.root || !absolute.startsWith(this.root + path.sep)) {
      throw new Error('Artifact path escapes task root');
    }
    return absolute;
  }

  public write(relativePath: string, content: string | Uint8Array): string {
    const destination = this.resolve(relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
    return destination;
  }
}
