import type { TransportStatistics } from '@/transport/BatchManager';
import type { Collector } from '@/types/collector';
import type { CaptureOptions } from '@/types/config';
import type { EventPipeline, EventSink } from '@/types/pipeline';

export type MonitorState =
  'idle' | 'starting' | 'running' | 'stopping' | 'stopped';

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
