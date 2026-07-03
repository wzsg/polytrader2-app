import type { AppPreferenceEventMap } from './appPreferenceEvents.js';
import type { PolymarketEventSyncEventMap } from './polymarketEventSyncEvents.js';
import type { PolymarketWalletEventMap } from './polymarketWalletEvents.js';

type ApplicationEventMap = AppPreferenceEventMap &
  PolymarketWalletEventMap &
  PolymarketEventSyncEventMap;
type ApplicationEventName = keyof ApplicationEventMap & string;
type ApplicationEventListener<EventName extends ApplicationEventName> = (
  ...args: ApplicationEventMap[EventName]
) => void;
type UnsubscribeApplicationEvent = () => void;

export type {
  ApplicationEventListener,
  ApplicationEventMap,
  ApplicationEventName,
  UnsubscribeApplicationEvent,
};
