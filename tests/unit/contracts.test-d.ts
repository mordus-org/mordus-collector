import type { MonitorEvent } from '@/index';

declare const validEvent: MonitorEvent;

const { eventId: omittedId, ...missingEventId } = validEvent;
void omittedId;

// @ts-expect-error Every event must have an eventId.
const incompleteEvent: MonitorEvent = missingEventId;
void incompleteEvent;

const unknownCategory: MonitorEvent = {
  ...validEvent,
  // @ts-expect-error Categories are a closed contract.
  category: 'unknown',
};
void unknownCategory;

const unsupportedSchema: MonitorEvent = {
  ...validEvent,
  // @ts-expect-error Schema version 1 is the only supported version.
  schemaVersion: 2,
};
void unsupportedSchema;
