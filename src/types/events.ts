export const SCHEMA_VERSION = 1 as const;

export const EVENT_CATEGORIES = [
  'element',
  'field',
  'form',
  'page',
  'custom',
  'error',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const AUTOMATIC_EVENT_TYPES = [
  'element.click',
  'field.change',
  'field.selection',
  'form.submit',
  'form.reset',
  'page.view',
  'error.javascript',
  'error.unhandledrejection',
] as const;

export type AutomaticEventType = (typeof AUTOMATIC_EVENT_TYPES)[number];
export type EventSource = 'auto' | 'manual';

export interface PageContext {
  path: string;
  route?: string;
  previousPath?: string;
  navigationType?: NavigationType;
}

export type NavigationType =
  | 'initial'
  | 'pushState'
  | 'replaceState'
  | 'popstate'
  | 'hashchange'
  | 'router';

export interface ElementDescriptor {
  identifier: string;
  path?: string[];
  tagName?: string;
}

export interface MonitorEvent {
  schemaVersion: typeof SCHEMA_VERSION;
  eventId: string;
  category: EventCategory;
  type: string;
  timestamp: string;
  projectId: string;
  sessionId: string;
  userId?: string;
  source: EventSource;
  page: PageContext;
  element?: ElementDescriptor;
  metadata?: Record<string, unknown>;
}

export interface RawMonitorEvent {
  category: EventCategory;
  type: string;
  source: EventSource;
  element?: ElementDescriptor;
  metadata?: Record<string, unknown>;
  page?: PageContext;
}
