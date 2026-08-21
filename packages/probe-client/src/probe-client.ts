import net from 'node:net';
import { ProbeResponseSchema, type ProbeResponse } from '@qt-ui-copilot/contracts';

export interface ProbeWireRequest {
  id: string;
  token: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface ProbeSuccess<T = unknown> { id: string; ok: true; result: T | undefined; }
export interface ProbeFailure { id: string; ok: false; error: { code: string; message: string }; }
export type ProbeReply<T = unknown> = ProbeSuccess<T> | ProbeFailure;

export class ProbeError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ProbeError'; }
}

export class ProbeClient {
  private socket?: net.Socket;
  private buffer = '';
  private readonly pending = new Map<string, { resolve: (reply: ProbeReply) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private readonly serverName: string) {}

  connect(timeoutMs = 3_000): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const socket = this.createSocket();
      const timer = setTimeout(() => fail(new ProbeError('TIMEOUT', `Probe connection timed out after ${timeoutMs}ms`)), timeoutMs);
      const fail = (error: Error): void => { clearTimeout(timer); socket.destroy(); reject(error); };
      socket.once('connect', () => { clearTimeout(timer); this.socket = socket; this.installHandlers(socket); resolve(); });
      socket.once('error', (error) => fail(new ProbeError('DISCONNECTED', error.message)));
    });
  }

  async request<T = unknown>(request: ProbeWireRequest, timeoutMs = 3_000): Promise<T> {
    if (!this.socket || this.socket.destroyed) throw new ProbeError('NOT_CONNECTED', 'ProbeClient is not connected');
    if (!request.id || !request.token || !request.method) throw new ProbeError('INVALID_REQUEST', 'id, token, and method are required');
    if (this.pending.has(request.id)) throw new ProbeError('DUPLICATE_REQUEST', `Request ${request.id} is already pending`);
    const reply = await new Promise<ProbeReply>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(request.id); reject(new ProbeError('TIMEOUT', `Probe request ${request.id} timed out after ${timeoutMs}ms`)); }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      this.socket!.write(`${JSON.stringify({ ...request, params: request.params || {} })}\n`, (error) => {
        if (error) this.settleFailure(request.id, new ProbeError('DISCONNECTED', error.message));
      });
    });
    if (!reply.ok) throw new ProbeError(reply.error.code, reply.error.message);
    return reply.result as T;
  }

  close(): void {
    if (this.socket) this.socket.destroy();
    this.socket = undefined;
    this.failAll(new ProbeError('CLOSED', 'ProbeClient was closed'));
  }

  private installHandlers(socket: net.Socket): void {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.consume(chunk));
    socket.on('error', (error) => this.failAll(new ProbeError('DISCONNECTED', error.message)));
    socket.on('close', () => { if (this.socket === socket) this.socket = undefined; this.failAll(new ProbeError('DISCONNECTED', 'Probe server disconnected')); });
  }
  private createSocket(): net.Socket {
    // Qt uses a named pipe / Unix-domain-socket name in production.  Supporting
    // host:port as well keeps the client deterministically testable.
    const match = /^([^:/]+):(\d+)$/.exec(this.serverName);
    return match ? net.createConnection({ host: match[1], port: Number(match[2]) }) : net.createConnection(this.serverName);
  }
  private consume(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let parsed: ProbeResponse;
      try { parsed = ProbeResponseSchema.parse(JSON.parse(line)) as ProbeResponse; }
      catch (error) { this.failAll(new ProbeError('MALFORMED_RESPONSE', `Probe returned invalid JSON: ${String(error)}`)); this.socket?.destroy(); return; }
      const pending = this.pending.get(parsed.id);
      if (!pending) continue;
      clearTimeout(pending.timer); this.pending.delete(parsed.id);
      if (parsed.success) pending.resolve({ id: parsed.id, ok: true, result: parsed.result });
      else pending.resolve({ id: parsed.id, ok: false, error: parsed.error! });
    }
  }
  private settleFailure(id: string, error: Error): void {
    const pending = this.pending.get(id); if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(id); pending.reject(error);
  }
  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) { clearTimeout(pending.timer); pending.reject(error); this.pending.delete(id); }
  }
}
