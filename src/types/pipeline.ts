import type { MonitorEvent, RawMonitorEvent } from './events.js';

export interface EventPipeline {
  process(event: RawMonitorEvent): void;
}

export interface EventSink {
  emit(event: MonitorEvent): void;
}
