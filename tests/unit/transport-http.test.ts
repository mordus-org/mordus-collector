import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { HttpTransport } from '@/transport/HttpTransport';

it('delivers JSON to HTTP and classifies server errors', async () => {
  const bodies: string[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += String(chunk);
    bodies.push(body);
    response.writeHead(Number(request.url?.slice(1)) || 204).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing server address');
  const endpoint = `http://127.0.0.1:${address.port}`;
  const body = '{"events":[]}';
  try {
    for (const [status, expected] of [
      [204, 'delivered'],
      [400, 'permanent'],
      [503, 'transient'],
    ] as const) {
      const transport = new HttpTransport(`${endpoint}/${status}`);
      expect(await transport.send(body, new AbortController().signal)).toBe(
        expected,
      );
    }
    expect(bodies).toEqual([body, body, body]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
