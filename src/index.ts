export { createMonitor, Monitor } from '@/core/Monitor';
export type { Collector } from '@/types/collector';
export type {
  CaptureOptions,
  MonitorConfig,
  ResolvedMonitorConfig,
  TransportOptions,
} from '@/types/config';
export {
  AUTOMATIC_EVENT_TYPES,
  EVENT_CATEGORIES,
  SCHEMA_VERSION,
} from '@/types/events';
export type {
  AutomaticEventType,
  ElementDescriptor,
  EventCategory,
  EventSource,
  MonitorEvent,
  NavigationType,
  PageContext,
  RawMonitorEvent,
} from '@/types/events';
export type { EventPipeline, EventSink } from '@/types/pipeline';
export type {
  CollectorRegistration,
  MonitorDependencies,
  MonitorState,
  MonitorTransport,
} from '@/types/monitor';
export { ElementResolver } from '@/identification/ElementResolver';

export type { DiscardCode, PipelineDiagnostics } from '@/pipeline/Diagnostics';

export type { TransportStatistics } from '@/transport/BatchManager';
