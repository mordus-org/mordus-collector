import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { URL } from 'node:url';

const files = new Map([
  ['/', ['../examples/vanilla-app/index.html', 'text/html; charset=utf-8']],
  ['/dist/index.js', ['../dist/index.js', 'text/javascript; charset=utf-8']],
  ['/dist/index.js.map', ['../dist/index.js.map', 'application/json']],
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const file = files.get(pathname);

  if (!file) {
    response.writeHead(404).end();
    return;
  }

  try {
    const [path, contentType] = file;
    const content = await readFile(new URL(path, import.meta.url));

    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  } catch {
    response
      .writeHead(500)
      .end('Build the package before starting the example.');
  }
});

server.listen(4173, '127.0.0.1', () => {
  console.log('Argus example at http://127.0.0.1:4173');
});
