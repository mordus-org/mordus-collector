import type {
  CaptureOptions,
  MonitorConfig,
  ResolvedMonitorConfig,
} from '@/types/config';

const CAPTURE_FEATURES = [
  'clicks',
  'fields',
  'forms',
  'navigation',
  'errors',
] as const;

function requireObject(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object.`);
  }
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer.`);
  }

  return value;
}

export function resolveConfiguration(
  config: MonitorConfig,
): ResolvedMonitorConfig {
  requireObject(config, 'config');

  if (
    typeof config.projectId !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(config.projectId)
  ) {
    throw new TypeError(
      'projectId must be a stable identifier of 1 to 128 letters, digits, dots, underscores or hyphens.',
    );
  }

  if (
    typeof config.endpoint !== 'string' ||
    config.endpoint.trim() !== config.endpoint ||
    config.endpoint.length === 0
  ) {
    throw new TypeError(
      'endpoint must be an HTTP(S) URL or a root-relative path.',
    );
  }

  let endpoint: URL;

  try {
    endpoint = new URL(config.endpoint, 'https://argus.invalid');
  } catch {
    throw new TypeError(
      'endpoint must be an HTTP(S) URL or a root-relative path.',
    );
  }

  const isRootRelative =
    config.endpoint.startsWith('/') && !config.endpoint.startsWith('//');
  const isAbsolute = /^https?:\/\//i.test(config.endpoint);

  if (
    (!isRootRelative && !isAbsolute) ||
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  ) {
    throw new TypeError(
      'endpoint must use HTTP(S), with no credentials or fragment.',
    );
  }

  const {
    attribute = 'data-monitor',
    collectionEnabled = false,
    capture: captureInput = {},
    transport: transportInput = {},
  } = config;

  if (
    typeof attribute !== 'string' ||
    !/^data-[a-z][a-z0-9-]*$/.test(attribute) ||
    attribute === 'data-monitor-ignore'
  ) {
    throw new TypeError(
      'attribute must be a data-* attribute distinct from data-monitor-ignore.',
    );
  }

  if (typeof collectionEnabled !== 'boolean') {
    throw new TypeError('collectionEnabled must be a boolean.');
  }

  requireObject(captureInput, 'capture');

  const capture: Required<CaptureOptions> = {
    clicks: true,
    fields: true,
    forms: true,
    navigation: true,
    errors: true,
  };

  for (const feature of CAPTURE_FEATURES) {
    const enabled =
      captureInput[feature] === undefined ? true : captureInput[feature];

    if (typeof enabled !== 'boolean') {
      throw new TypeError(`capture.${feature} must be a boolean.`);
    }

    capture[feature] = enabled;
  }

  requireObject(transportInput, 'transport');

  const {
    batchSize = 20,
    flushIntervalMs = 5000,
    maxQueueSize = 1000,
  } = transportInput;

  const transport = {
    batchSize: positiveInteger(batchSize, 'transport.batchSize'),
    flushIntervalMs: positiveInteger(
      flushIntervalMs,
      'transport.flushIntervalMs',
    ),
    maxQueueSize: positiveInteger(maxQueueSize, 'transport.maxQueueSize'),
  };

  if (transport.batchSize > transport.maxQueueSize) {
    throw new TypeError(
      'transport.batchSize must not exceed transport.maxQueueSize.',
    );
  }

  return Object.freeze({
    projectId: config.projectId,
    endpoint: config.endpoint,
    attribute,
    capture: Object.freeze(capture),
    transport: Object.freeze(transport),
    collectionEnabled,
  });
}
