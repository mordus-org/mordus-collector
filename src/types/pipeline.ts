import type { MonitorEvent, RawMonitorEvent } from '@/types/events';

export interface EventPipeline {
  process(event: RawMonitorEvent): void;
}

export interface EventSink {
  emit(event: MonitorEvent): void;
}
