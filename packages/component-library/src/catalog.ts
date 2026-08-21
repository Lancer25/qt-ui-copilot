import { readFileSync, readdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { ComponentRecord } from '@qt-ui-copilot/contracts';
import { ComponentRecordSchema } from '@qt-ui-copilot/contracts';
import type { ArtifactStore } from '@qt-ui-copilot/project-core';
import type { NativePreviewRequest, PreviewClient } from '@qt-ui-copilot/preview-client';
import { parseUi, buildUiFingerprint, type ParsedUiDocument } from '@qt-ui-copilot/ui-document';
import { rankComponent, type ComponentCandidate, type ComponentQuery } from './search.js';
import { UnconfiguredVectorSearchAdapter, type VectorSearchAdapter } from './vector-adapter.js';

interface ComponentManifest extends Omit<ComponentRecord, 'uiFragment' | 'screenshotPaths' | 'widgetClasses' | 'layoutTypes' | 'connections' | 'qrcDependencies' | 'customWidgets'> {
  sourceUiFile: string;
  qrcDependencies?: string[];
  customWidgets?: ComponentRecord['customWidgets'];
  connections?: ComponentRecord['connections'];
  preview?: Omit<NativePreviewRequest, 'uiFile'>;
}

export interface ComponentCatalogOptions {
  databasePath?: string;
  vectorAdapter?: VectorSearchAdapter;
  previewClient?: Pick<PreviewClient, 'render'>;
  artifactStore?: ArtifactStore;
}

function allManifestPaths(root: string): string[] {
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && entry.name === 'component.json') paths.push(candidate);
    }
  };
  visit(root);
  return paths;
}

function rootItem(document: ParsedUiDocument): string {
  return `<item>\n${document.rootWidget.element.source}\n</item>`;
}

function recordFromManifest(manifestPath: string): { record: ComponentRecord; preview?: Omit<NativePreviewRequest, 'uiFile'> } {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ComponentManifest;
  const { preview, ...recordFields } = manifest;
  const baseDirectory = path.dirname(manifestPath);
  const uiPath = path.resolve(baseDirectory, manifest.sourceUiFile);
  if (!uiPath.startsWith(baseDirectory + path.sep)) throw new Error(`Component source UI escapes manifest directory: ${manifest.sourceUiFile}`);
  if (!statSync(uiPath).isFile()) throw new Error(`Component source UI does not exist: ${manifest.sourceUiFile}`);
  const document = parseUi(readFileSync(uiPath, 'utf8'), uiPath);
  const fingerprint = buildUiFingerprint(document);
  const objectNames = new Set([...fingerprint.widgetNames, ...fingerprint.layoutNames]);
  const internalConnections = document.index.connections.filter((connection) => objectNames.has(connection.sender) && objectNames.has(connection.receiver));
  return {
    record: ComponentRecordSchema.parse({
      ...recordFields,
      sourceUiFile: uiPath,
      rootObjectName: document.rootWidget.objectName,
      uiFragment: rootItem(document),
      screenshotPaths: [],
      widgetClasses: fingerprint.widgetClasses,
      layoutTypes: fingerprint.layoutClasses,
      qrcDependencies: manifest.qrcDependencies ?? document.index.resources.map((resource) => resource.location),
      customWidgets: manifest.customWidgets ?? document.index.customWidgets,
      connections: manifest.connections ?? internalConnections,
    }),
    preview,
  };
}

export class ComponentCatalog {
  private readonly database: DatabaseSync;
  private readonly vectorAdapter: VectorSearchAdapter;
  private readonly previewClient?: Pick<PreviewClient, 'render'>;
  private readonly artifactStore?: ArtifactStore;

  public constructor(options: ComponentCatalogOptions = {}) {
    this.database = new DatabaseSync(options.databasePath ?? ':memory:');
    this.vectorAdapter = options.vectorAdapter ?? new UnconfiguredVectorSearchAdapter();
    this.previewClient = options.previewClient;
    this.artifactStore = options.artifactStore;
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS component_records (id TEXT PRIMARY KEY, record_json TEXT NOT NULL, searchable TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS component_fts USING fts5(id UNINDEXED, searchable);
    `);
  }

  public close(): void { this.database.close(); }

  public async indexLibrary(root: string): Promise<number> {
    const absoluteRoot = path.resolve(root);
    let indexed = 0;
    for (const manifestPath of allManifestPaths(absoluteRoot)) {
      const { record, preview } = recordFromManifest(manifestPath);
      const enriched = await this.indexScreenshot(record, preview);
      const searchable = [enriched.name, enriched.description, enriched.structureSummary, ...enriched.tags, ...enriched.widgetClasses, ...enriched.layoutTypes].join(' ');
      this.database.prepare('INSERT OR REPLACE INTO component_records (id, record_json, searchable) VALUES (?, ?, ?)')
        .run(enriched.id, JSON.stringify(enriched), searchable);
      this.database.prepare('DELETE FROM component_fts WHERE id = ?').run(enriched.id);
      this.database.prepare('INSERT INTO component_fts (id, searchable) VALUES (?, ?)').run(enriched.id, searchable);
      indexed += 1;
    }
    return indexed;
  }

  private async indexScreenshot(record: ComponentRecord, preview?: Omit<NativePreviewRequest, 'uiFile'>): Promise<ComponentRecord> {
    if (!this.previewClient || !preview) return record;
    const result = await this.previewClient.render({ ...preview, uiFile: record.sourceUiFile });
    if (!result.success || !result.imagePath) return record;
    if (!this.artifactStore) return { ...record, screenshotPaths: [result.imagePath] };
    const extension = path.extname(result.imagePath) || '.png';
    const artifactPath = this.artifactStore.write(`components/${record.id}${extension}`, readFileSync(result.imagePath));
    return { ...record, screenshotPaths: [artifactPath] };
  }

  public async search(query: ComponentQuery): Promise<ComponentCandidate[]> {
    // FTS is used as a local candidate accelerator. Ranking remains deterministic
    // in TypeScript so the same result is available if a platform lacks FTS5.
    let matchingIds: Set<string> | undefined;
    const text = query.text.trim();
    if (text) {
      try {
        // A quoted phrase keeps user input data rather than FTS syntax. If the
        // tokenizer cannot represent a language, the fallback below preserves
        // ordinary offline substring ranking.
        const ftsQuery = `"${text.replaceAll('"', '""')}"`;
        const ftsRows = this.database.prepare('SELECT id FROM component_fts WHERE component_fts MATCH ?').all(ftsQuery) as { id: string }[];
        if (ftsRows.length > 0) matchingIds = new Set(ftsRows.map((row) => row.id));
      } catch {
        // FTS5 is an optimisation, never an availability dependency.
      }
    }
    const rows = this.database.prepare('SELECT id, record_json FROM component_records').all() as { id: string; record_json: string }[];
    let vectors: readonly { componentId: string; score: number }[] = [];
    if (this.vectorAdapter.configured) {
      try {
        vectors = await this.vectorAdapter.search({ text: query.text, limit: query.limit ?? 3 });
      } catch {
        // A later optional cloud adapter must not make the offline catalogue
        // unavailable when credentials, connectivity, or its service fail.
        vectors = [];
      }
    }
    const vectorScores = new Map(vectors.map((result) => [result.componentId, result.score]));
    const candidates = rows
      .filter((row) => !matchingIds || matchingIds.has(row.id) || vectorScores.has(row.id))
      .map((row) => ComponentRecordSchema.parse(JSON.parse(row.record_json)))
      .map((record) => rankComponent(record, query, vectorScores.get(record.id) ?? 0))
      .filter((candidate): candidate is ComponentCandidate => candidate !== undefined)
      .sort((left, right) => right.score - left.score || left.componentId.localeCompare(right.componentId));
    return candidates.slice(0, query.limit ?? 3);
  }
}
