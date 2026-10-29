import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { z } from 'zod';
import { ComponentSourceItemSchema, type ComponentSourceItem, type ComponentSourceRecord } from '@qt-ui-copilot/contracts';

const TOOL_LIST = 'qt_components_list';
const TOOL_GET = 'qt_component_get';

const ListedComponentSchema = z.object({
  componentId: z.string().min(1).max(128), name: z.string().min(1).max(256), description: z.string().min(1).max(4096),
  tags: z.array(z.string().min(1).max(128)).max(64).default([]), qtVersionRange: z.string().max(128).optional(),
}).strict();
const ListOutputSchema = z.object({ components: z.array(ListedComponentSchema).max(100), nextCursor: z.string().max(1024).optional() }).strict();
const BundleSchema = ListedComponentSchema.extend({
  uiSource: z.string().min(1).max(2_000_000),
  assets: z.array(z.object({ path: z.string().min(1).max(1024), kind: z.enum(['qss', 'qrc', 'font', 'image', 'text']), text: z.string().max(2_000_000).optional(), dataUrl: z.string().max(14_000_000).optional() }).strict()).max(128).default([]),
  license: z.object({ name: z.string().min(1).max(256), spdx: z.string().max(128).optional(), url: z.string().url().max(2048).optional() }).strict(),
  previewDataUrl: z.string().max(14_000_000).optional(),
}).strict();

export interface McpClientLike {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<{ structuredContent?: unknown; content?: unknown; isError?: boolean }>;
  close(): Promise<void>;
}

export interface McpClientConnection { client: McpClientLike; transport: unknown }
export type McpClientFactory = (source: ComponentSourceRecord, credential?: string) => McpClientConnection;

function defaultFactory(source: ComponentSourceRecord, credential?: string): McpClientConnection {
  const client = new Client({ name: 'qt-ui-copilot', version: '0.1.0' }) as unknown as McpClientLike;
  if (source.kind === 'mcp_stdio') {
    const config = source.config as { command: string; args?: string[]; cwd?: string };
    return { client, transport: new StdioClientTransport({ command: config.command, args: config.args ?? [], ...(config.cwd ? { cwd: config.cwd } : {}), stderr: 'pipe', maxBufferSize: 16 * 1024 * 1024 }) };
  }
  if (source.kind === 'mcp_http') {
    const config = source.config as { url: string };
    return { client, transport: new StreamableHTTPClientTransport(new URL(config.url), { requestInit: credential ? { headers: { Authorization: `Bearer ${credential}` } } : undefined }) };
  }
  throw new Error(`Unsupported MCP source kind: ${source.kind}`);
}

function structured(result: { structuredContent?: unknown; isError?: boolean }, tool: string): unknown {
  if (result.isError) throw new Error(`MCP tool ${tool} returned an error`);
  if (result.structuredContent === undefined) throw new Error(`MCP tool ${tool} must return structuredContent`);
  return result.structuredContent;
}

export class McpComponentSourceAdapter {
  public constructor(private readonly factory: McpClientFactory = defaultFactory) {}

  async test(source: ComponentSourceRecord, credential?: string): Promise<{ tools: string[] }> {
    const { client, transport } = this.factory(source, credential);
    try {
      await client.connect(transport);
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      for (const required of [TOOL_LIST, TOOL_GET]) if (!names.includes(required)) throw new Error(`MCP component source is missing required read-only tool: ${required}`);
      return { tools: names };
    } finally { await client.close().catch(() => undefined); }
  }

  async discover(source: ComponentSourceRecord, credential?: string, query?: string): Promise<ComponentSourceItem[]> {
    const { client, transport } = this.factory(source, credential);
    try {
      await client.connect(transport);
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      for (const required of [TOOL_LIST, TOOL_GET]) if (!names.includes(required)) throw new Error(`MCP component source is missing required read-only tool: ${required}`);
      const listed: z.infer<typeof ListedComponentSchema>[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 16; page += 1) {
        const response = await client.callTool({ name: TOOL_LIST, arguments: { limit: 100, ...(query ? { query } : {}), ...(cursor ? { cursor } : {}) } });
        const output = ListOutputSchema.parse(structured(response, TOOL_LIST));
        listed.push(...output.components);
        if (listed.length > 256) throw new Error('MCP component source exceeds the 256 component limit');
        cursor = output.nextCursor;
        if (!cursor) break;
        if (page === 15) throw new Error('MCP component pagination exceeded 16 pages');
      }
      const unique = new Set<string>();
      const items: ComponentSourceItem[] = [];
      for (const metadata of listed) {
        if (unique.has(metadata.componentId)) throw new Error(`MCP source returned duplicate component ID: ${metadata.componentId}`);
        unique.add(metadata.componentId);
        const response = await client.callTool({ name: TOOL_GET, arguments: { componentId: metadata.componentId } });
        const bundle = BundleSchema.parse(structured(response, TOOL_GET));
        if (bundle.componentId !== metadata.componentId) throw new Error(`MCP component identity mismatch for ${metadata.componentId}`);
        const contentHash = createHash('sha256').update(bundle.uiSource).update(JSON.stringify(bundle.assets)).digest('hex');
        items.push(ComponentSourceItemSchema.parse({ sourceId: source.id, componentId: bundle.componentId, name: bundle.name, description: bundle.description, tags: bundle.tags, uiSource: bundle.uiSource, assets: bundle.assets, ...(bundle.qtVersionRange ? { qtVersionRange: bundle.qtVersionRange } : {}), license: bundle.license, inferred: false, ...(bundle.previewDataUrl ? { previewDataUrl: bundle.previewDataUrl } : {}), contentHash, updatedAt: Date.now() }));
      }
      return items;
    } finally { await client.close().catch(() => undefined); }
  }
}
