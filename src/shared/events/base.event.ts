/**
 * Base event class — all domain events extend this.
 * Provides correlation tracking for event-driven side effects.
 */
export abstract class BaseEvent {
  public readonly timestamp: Date;
  public readonly correlationId: string;
  public readonly eventName: string;

  constructor(eventName: string, correlationId?: string) {
    this.eventName = eventName;
    this.timestamp = new Date();
    this.correlationId = correlationId || '';
  }
}
