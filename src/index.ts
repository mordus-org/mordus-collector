export { createMonitor, Monitor } from './core/Monitor.js';
export type { Collector } from './types/collector.js';
export type {
  CaptureOptions,
  MonitorConfig,
  ResolvedMonitorConfig,
  TransportOptions,
} from './types/config.js';
export {
  AUTOMATIC_EVENT_TYPES,
  EVENT_CATEGORIES,
  SCHEMA_VERSION,
} from './types/events.js';
export type {
  AutomaticEventType,
  ElementDescriptor,
  EventCategory,
  EventSource,
  MonitorEvent,
  NavigationType,
  PageContext,
  RawMonitorEvent,
} from './types/events.js';
export type { EventPipeline, EventSink } from './types/pipeline.js';
export type {
  CollectorRegistration,
  MonitorDependencies,
  MonitorState,
  MonitorTransport,
} from './types/monitor.js';
export { ElementResolver } from './identification/ElementResolver.js';

export type {
  DiscardCode,
  PipelineDiagnostics,
} from './pipeline/Diagnostics.js';

export type { TransportStatistics } from './transport/BatchManager.js';
