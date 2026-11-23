export interface CaptureOptions {
  clicks?: boolean;
  fields?: boolean;
  forms?: boolean;
  navigation?: boolean;
  errors?: boolean;
}

export interface TransportOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
}

export interface MonitorConfig {
  projectId: string;
  endpoint: string;
  attribute?: string;
  capture?: CaptureOptions;
  transport?: TransportOptions;
  collectionEnabled?: boolean;
}

export interface ResolvedMonitorConfig {
  readonly projectId: string;
  readonly endpoint: string;
  readonly attribute: string;
  readonly capture: Readonly<Required<CaptureOptions>>;
  readonly transport: Readonly<Required<TransportOptions>>;
  readonly collectionEnabled: boolean;
}
