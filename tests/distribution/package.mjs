import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'mordus-distribution-'));
const consumerDirectory = join(temporaryDirectory, 'consumer');
const npmCli = process.env.npm_execpath;

function npm(args, cwd) {
  if (npmCli) {
    return execFileSync(process.execPath, [npmCli, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  }

  return execFileSync('npm', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

try {
  mkdirSync(consumerDirectory);

  npm(['run', 'build'], projectRoot);

  const packageFiles = JSON.parse(
    npm(
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporaryDirectory,
      ],
      projectRoot,
    ),
  );
  const packageFile = packageFiles[0];

  assert.ok(packageFile?.filename, 'npm pack did not produce a tarball');

  writeFileSync(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({
      name: 'mordus-consumer-test',
      private: true,
      type: 'module',
    }),
  );

  npm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      join(temporaryDirectory, packageFile.filename),
    ],
    consumerDirectory,
  );

  const installedPackage = JSON.parse(
    readFileSync(
      join(consumerDirectory, 'node_modules/@mordus/monitor/package.json'),
      'utf8',
    ),
  );

  assert.equal(installedPackage.name, '@mordus/monitor');
  assert.equal(Object.keys(installedPackage.dependencies ?? {}).length, 0);
  assert.ok(
    readFileSync(
      join(
        consumerDirectory,
        'node_modules/@mordus/monitor/src/transport/README.md',
      ),
      'utf8',
    ).includes('events'),
  );
  assert.ok(
    readFileSync(
      join(
        consumerDirectory,
        'node_modules/@mordus/monitor/examples/shopping-app/index.html',
      ),
      'utf8',
    ).includes('shop.home'),
  );

  writeFileSync(
    join(consumerDirectory, 'consumer.ts'),
    `import { createMonitor, SCHEMA_VERSION } from '@mordus/monitor';
import type { MonitorConfig, MonitorEvent } from '@mordus/monitor';

const config: MonitorConfig = {
  projectId: 'distribution-test',
  endpoint: '/events',
};
const monitor = createMonitor(config);
const eventVersion: MonitorEvent['schemaVersion'] = SCHEMA_VERSION;
void monitor;
void eventVersion;
`,
  );

  writeFileSync(
    join(consumerDirectory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        skipLibCheck: false,
      },
      include: ['consumer.ts'],
    }),
  );

  execFileSync(
    process.execPath,
    [
      join(projectRoot, 'node_modules/typescript/bin/tsc'),
      '--project',
      consumerDirectory,
    ],
    { stdio: 'inherit' },
  );

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import { createMonitor, SCHEMA_VERSION } from '@mordus/monitor'; if (SCHEMA_VERSION !== 1 || !createMonitor({ projectId: 'distribution-test', endpoint: '/events' })) process.exit(1);",
    ],
    { cwd: consumerDirectory, stdio: 'inherit' },
  );

  const receivedEvents = [];
  const installedBundle = readFileSync(
    join(consumerDirectory, 'node_modules/@mordus/monitor/dist/index.js'),
  );
  const server = createServer(async (request, response) => {
    if (request.url === '/sdk.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(installedBundle);
      return;
    }

    if (request.url === '/events' && request.method === 'POST') {
      const chunks = [];

      for await (const chunk of request) {
        chunks.push(chunk);
      }

      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      receivedEvents.push(...body.events);
      response.writeHead(204).end();
      return;
    }

    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html>
<html><head><script type="importmap">{"imports":{"@mordus/monitor":"/sdk.js"}}</script></head>
<body><button id="action" data-monitor="distribution.action">Action</button>
<form id="form" data-monitor="distribution.form"><input id="field" data-monitor="distribution.field"><button type="submit">Submit</button></form>
<script type="module">
import { createMonitor } from '@mordus/monitor';
window.monitor = createMonitor({ projectId: 'distribution-test', endpoint: '/events', collectionEnabled: true, transport: { batchSize: 1 } });
document.querySelector('#form').addEventListener('submit', event => event.preventDefault());
await window.monitor.start();
window.ready = true;
</script></body></html>`);
  });

  let browser;

  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', resolveListen);
    });

    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => globalThis.ready === true);
    await page.click('#action');
    await page.fill('#field', 'private-value-123');
    await page.locator('#field').blur();
    await page.click('#form button');
    await page.evaluate(async () => {
      globalThis.history.pushState(null, '', '/products');
      globalThis.monitor.track('cart.item_added', { product: 'sku_123' });
      await globalThis.monitor.flush();
      globalThis.monitor.stop();
    });

    const types = receivedEvents.map((event) => event.type);

    for (const type of [
      'element.click',
      'field.change',
      'form.submit',
      'page.view',
      'cart.item_added',
    ]) {
      assert.ok(
        types.includes(type),
        `Installed package did not deliver ${type}`,
      );
    }

    assert.ok(!JSON.stringify(receivedEvents).includes('private-value-123'));
  } finally {
    await browser?.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  process.stdout.write(
    'Installed package imports, typechecks and completes a browser journey.\n',
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
