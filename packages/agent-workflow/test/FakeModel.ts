import type { ModelProvider, ModelRequest } from '../src/model-provider.js';

/** A deterministic provider for unit tests. It never contacts a model service. */
export class FakeModel implements ModelProvider {
  readonly requests: ModelRequest[] = [];
  private readonly replies: unknown[] = [];

  replyWith(value: unknown): this {
    this.replies.push(value);
    return this;
  }

  async generate(request: ModelRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.replies.length === 0) throw new Error('FakeModel has no queued reply');
    return this.replies.shift();
  }
}
