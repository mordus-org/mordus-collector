import { SCHEMA_VERSION } from '../types/events.js';
import type {
  MonitorEvent,
  PageContext,
  RawMonitorEvent,
} from '../types/events.js';

interface EventFactoryOptions {
  projectId: string;
  sessionId: string;
  now(): Date;
  generateId(): string;
  getUserId?(): string | undefined;
}

export class EventFactory {
  constructor(private readonly options: EventFactoryOptions) {}

  create(event: RawMonitorEvent, page: PageContext): MonitorEvent {
    const userId = this.options.getUserId?.();
    return {
      schemaVersion: SCHEMA_VERSION,
      eventId: this.options.generateId(),
      category: event.category,
      type: event.type,
      timestamp: this.options.now().toISOString(),
      projectId: this.options.projectId,
      sessionId: this.options.sessionId,
      source: event.source,
      page,
      ...(userId === undefined ? {} : { userId }),
      ...(event.element === undefined ? {} : { element: event.element }),
      ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
    };
  }
}
