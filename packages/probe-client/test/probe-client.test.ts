import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ProbeClient, ProbeError, resolveProbeEndpoint } from '../src/index.js';

const servers: net.Server[] = [];
async function server(handler: (socket: net.Socket) => void): Promise<string> {
  const instance = net.createServer(handler); servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return `127.0.0.1:${address.port}`;
}
afterEach(async () => { await Promise.all(servers.splice(0).map((item) => new Promise<void>((resolve) => item.close(() => resolve())))); });

describe('ProbeClient JSON-lines protocol', () => {
  it('returns typed successful responses', async () => {
    const name = await server((socket) => socket.on('data', () => socket.write('{"id":"a","success":true,"result":{"objectName":"saveButton"}}\n')));
    const client = new ProbeClient(name); await client.connect();
    await expect(client.request<{ objectName: string }>({ id: 'a', token: 'token', method: 'findWidget', params: { objectName: 'saveButton' } })).resolves.toEqual({ objectName: 'saveButton' });
    client.close();
  });
  it('converts probe failures into ProbeError', async () => {
    const name = await server((socket) => socket.on('data', () => socket.write('{"id":"b","success":false,"error":{"code":"AUTH_FAILED","message":"no"}}\n')));
    const client = new ProbeClient(name); await client.connect();
    await expect(client.request({ id: 'b', token: 'bad', method: 'listWindows' })).rejects.toMatchObject<Partial<ProbeError>>({ code: 'AUTH_FAILED' }); client.close();
  });
  it('rejects pending calls when the server disconnects', async () => {
    const name = await server((socket) => socket.on('data', () => socket.destroy()));
    const client = new ProbeClient(name); await client.connect();
    await expect(client.request({ id: 'c', token: 'token', method: 'listWindows' })).rejects.toMatchObject<Partial<ProbeError>>({ code: 'DISCONNECTED' }); client.close();
  });
});

describe('resolveProbeEndpoint', () => {
  it('maps Qt logical server names to Windows named-pipe paths', () => {
    expect(resolveProbeEndpoint('qt-ui-copilot-session', 'win32')).toBe('\\\\.\\pipe\\qt-ui-copilot-session');
  });

  it('preserves an already-qualified Windows named-pipe path', () => {
    const pipe = '\\\\.\\pipe\\qt-ui-copilot-session';
    expect(resolveProbeEndpoint(pipe, 'win32')).toBe(pipe);
  });

  it('preserves explicit TCP endpoints on Windows', () => {
    expect(resolveProbeEndpoint('127.0.0.1:45231', 'win32')).toEqual({ host: '127.0.0.1', port: 45231 });
  });

  it('keeps logical names unchanged on POSIX platforms', () => {
    expect(resolveProbeEndpoint('/tmp/qt-ui-copilot.sock', 'linux')).toBe('/tmp/qt-ui-copilot.sock');
  });
});
