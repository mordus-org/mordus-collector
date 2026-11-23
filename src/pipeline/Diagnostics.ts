export const DISCARD_CODES = [
  'unauthorized',
  'invalid_event',
  'invalid_metadata',
  'reentrant',
  'processing_error',
  'transport_error',
] as const;
export type DiscardCode = (typeof DISCARD_CODES)[number];
export interface PipelineDiagnostics {
  emitted: number;
  discarded: Record<DiscardCode, number>;
}

export class Diagnostics {
  private emitted = 0;
  private readonly discarded: Record<DiscardCode, number> = {
    unauthorized: 0,
    invalid_event: 0,
    invalid_metadata: 0,
    reentrant: 0,
    processing_error: 0,
    transport_error: 0,
  };

  record(code: DiscardCode): void {
    this.discarded[code] += 1;
  }
  recordEmission(): void {
    this.emitted += 1;
  }
  get snapshot(): PipelineDiagnostics {
    return { emitted: this.emitted, discarded: { ...this.discarded } };
  }
}
