import { EventEmitter } from 'events';
import type {
  ApplicationEventListener,
  ApplicationEventMap,
  ApplicationEventName,
  UnsubscribeApplicationEvent,
} from './types.js';

class ApplicationEventBus extends EventEmitter {
  public publish<EventName extends ApplicationEventName>(
    eventName: EventName,
    ...args: ApplicationEventMap[EventName]
  ): boolean {
    return super.emit(eventName, ...args);
  }

  public subscribe<EventName extends ApplicationEventName>(
    eventName: EventName,
    listener: ApplicationEventListener<EventName>,
  ): UnsubscribeApplicationEvent {
    const untypedListener = listener as (...args: unknown[]) => void;
    super.on(eventName, untypedListener);
    return () => {
      super.off(eventName, untypedListener);
    };
  }
}

function createApplicationEventBus(): ApplicationEventBus {
  return new ApplicationEventBus();
}

export { ApplicationEventBus, createApplicationEventBus };
