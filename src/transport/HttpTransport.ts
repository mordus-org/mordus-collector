export type DeliveryResult =
  | 'delivered'
  | 'transient'
  | 'permanent'
  | 'cancelled';

export class HttpTransport {
  constructor(
    private readonly endpoint: string,
    private readonly request: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = 10000,
  ) {}

  async send(body: string, signal: AbortSignal): Promise<DeliveryResult> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);

    try {
      if (signal.aborted) return 'cancelled';

      const response = await this.request(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        keepalive: true,
        signal: controller.signal,
      });

      if (signal.aborted) return 'cancelled';
      if (response.ok) return 'delivered';
      if (
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        return 'transient';
      }

      return 'permanent';
    } catch {
      return signal.aborted ? 'cancelled' : 'transient';
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
}
