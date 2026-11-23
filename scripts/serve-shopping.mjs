import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { URL } from 'node:url';

export function createShoppingServer() {
  const events = [];
  const seen = new Set();

  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/api/monitor/events') {
      try {
        let body = '';
        for await (const chunk of request) body += chunk;

        const batch = JSON.parse(body).events;
        if (!Array.isArray(batch)) throw new TypeError('Invalid batch');

        for (const event of batch) {
          if (
            typeof event.projectId !== 'string' ||
            typeof event.eventId !== 'string'
          ) {
            throw new TypeError('Invalid event');
          }

          const key = `${event.projectId}:${event.eventId}`;
          if (seen.has(key)) continue;

          seen.add(key);
          events.push(event);
        }

        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
      return;
    }

    if (request.url === '/api/monitor/events' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ events }));
      return;
    }

    const file =
      request.url === '/dist/index.js'
        ? '../dist/index.js'
        : request.url === '/shopping-app.js'
          ? '../examples/shopping-app/app.js'
          : '../examples/shopping-app/index.html';

    try {
      const content = await readFile(new URL(file, import.meta.url));
      const contentType = file.endsWith('.html')
        ? 'text/html'
        : 'text/javascript';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(content);
    } catch {
      response.writeHead(500).end();
    }
  });

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  createShoppingServer().listen(4174, '127.0.0.1');
}
