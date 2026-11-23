import type { TransportStatistics } from '../transport/BatchManager.js';
import type { Collector } from './collector.js';
import type { CaptureOptions } from './config.js';
import type { EventPipeline, EventSink } from './pipeline.js';

export type MonitorState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped';

export interface CollectorRegistration {
  name: string;
  capture?: keyof CaptureOptions;
  create(pipeline: EventPipeline): Collector;
}

export interface MonitorTransport extends EventSink {
  readonly statistics?: TransportStatistics;
  start?(): void;
  stop?(): void;
  clear?(): void;
  flush(): Promise<void>;
}

export interface MonitorDependencies {
  now?: () => Date;
  generateId?: () => string;
  transport?: MonitorTransport;
  collectors?: readonly CollectorRegistration[];
}
