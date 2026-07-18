import type {
  OrderFilledActivitySnapshot,
  OrderFilledActivityStartInput,
} from '@polytrader/shared';

interface OrderFilledActivityServiceEventMap {
  updated: [snapshot: OrderFilledActivitySnapshot];
}

interface OrderFilledActivityServiceOptions {
  websocketUrl?: string;
  syncUrl?: string;
  maxTrades?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
}

interface OrderFilledActivityService {
  start(input: OrderFilledActivityStartInput): Promise<OrderFilledActivitySnapshot>;
  stop(): void;
  dispose(): void;
  getSnapshot(): OrderFilledActivitySnapshot;
}

export type {
  OrderFilledActivityService,
  OrderFilledActivityServiceEventMap,
  OrderFilledActivityServiceOptions,
};
