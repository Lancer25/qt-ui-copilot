import { describe, expect, it } from 'vitest';
import { ComponentSourceInputSchema, ComponentSourceItemSchema } from '../src/index.js';

describe('component source contracts', () => {
  it('accepts local, stdio and secure HTTP configurations', () => {
    expect(ComponentSourceInputSchema.parse({ name: 'Local', kind: 'local', config: { rootDir: 'D:/widgets' } }).config).toMatchObject({ discovery: 'hybrid' });
    expect(ComponentSourceInputSchema.parse({ name: 'MCP', kind: 'mcp_stdio', config: { command: 'node', args: ['server.js'] } }).kind).toBe('mcp_stdio');
    expect(ComponentSourceInputSchema.parse({ name: 'Remote', kind: 'mcp_http', config: { url: 'https://components.example.com/mcp' } }).kind).toBe('mcp_http');
    expect(() => ComponentSourceInputSchema.parse({ name: 'Unsafe', kind: 'mcp_http', config: { url: 'http://components.example.com/mcp' } })).toThrow(/HTTPS/);
    expect(ComponentSourceInputSchema.parse({ name: 'Loopback', kind: 'mcp_http', config: { url: 'http://127.0.0.1:3000/mcp' } }).kind).toBe('mcp_http');
    const binary = ComponentSourceInputSchema.parse({
      name: 'Fancy widgets',
      kind: 'qt_binary',
      config: {
        rootDir: 'D:/widgets',
        discovery: 'scan',
        mappings: [{ componentId: 'fancy-card', className: 'FancyCard', baseClass: 'QWidget', headerPath: 'include/FancyCard.hpp', libPath: 'lib/FancyCard.lib', qtModules: ['widgets'], approved: false }],
      },
    });
    expect(binary.kind).toBe('qt_binary');
    if (binary.kind === 'qt_binary') expect(binary.config.mappings?.[0]?.headerPath).toBe('include/FancyCard.hpp');
    expect(() => ComponentSourceInputSchema.parse({ name: 'Escaped', kind: 'qt_binary', config: { rootDir: 'D:/widgets', mappings: [{ componentId: 'bad', className: 'Bad', baseClass: 'QWidget', headerPath: '../outside.hpp', qtModules: [], approved: false }] } })).toThrow(/relative/);
  });

  it('rejects traversal and oversized component payloads', () => {
    const base = { sourceId: 'source', componentId: 'card', name: 'Card', description: 'Card', uiSource: '<ui/>', license: { name: 'MIT' }, contentHash: 'a'.repeat(64), updatedAt: 1 };
    expect(() => ComponentSourceItemSchema.parse({ ...base, assets: [{ path: '../secret.qss', kind: 'qss', text: 'x' }] })).toThrow(/relative/);
    expect(() => ComponentSourceItemSchema.parse({ ...base, uiSource: 'x'.repeat(2_000_001) })).toThrow();
  });
});
