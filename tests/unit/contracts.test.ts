import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@/index';
import type { MonitorEvent } from '@/index';

describe('MonitorEvent contract', () => {
  it('accepts the minimal event without optional content', () => {
    const event: MonitorEvent = {
      schemaVersion: SCHEMA_VERSION,
      eventId: 'event-1',
      category: 'page',
      type: 'page.view',
      timestamp: '2026-01-01T00:00:00.000Z',
      projectId: 'example',
      sessionId: 'session-1',
      source: 'auto',
      page: { path: '/' },
    };

    expect(event.schemaVersion).toBe(1);
    expect(Object.keys(event).sort()).toEqual([
      'category',
      'eventId',
      'page',
      'projectId',
      'schemaVersion',
      'sessionId',
      'source',
      'timestamp',
      'type',
    ]);
  });
});
