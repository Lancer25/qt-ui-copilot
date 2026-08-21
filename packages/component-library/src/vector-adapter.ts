/**
 * A deliberately small boundary for a future, user-configured vector service.
 * The offline catalog never creates network clients and treats an unavailable
 * adapter as an empty supplemental ranking signal.
 */
export interface VectorSearchAdapter {
  readonly configured: boolean;
  search(query: { text: string; limit: number }): Promise<readonly { componentId: string; score: number }[]>;
}

export class UnconfiguredVectorSearchAdapter implements VectorSearchAdapter {
  public readonly configured = false;

  public async search(): Promise<readonly { componentId: string; score: number }[]> {
    return [];
  }
}
