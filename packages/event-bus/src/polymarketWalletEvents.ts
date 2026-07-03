import type { PolymarketWalletSummary } from '@polytrader/shared';

interface PolymarketWalletCreatedEvent {
  wallet: PolymarketWalletSummary;
  at: string;
}

interface PolymarketWalletUpdatedEvent {
  wallet: PolymarketWalletSummary;
  previousWallet: PolymarketWalletSummary;
  at: string;
}

interface PolymarketWalletDeletedEvent {
  wallet: PolymarketWalletSummary;
  at: string;
}

interface PolymarketWalletDefaultChangedEvent {
  wallet: PolymarketWalletSummary;
  previousDefaultWalletId: string | null;
  at: string;
}

type PolymarketWalletEventMap = {
  'polymarket-wallet:created': [event: PolymarketWalletCreatedEvent];
  'polymarket-wallet:updated': [event: PolymarketWalletUpdatedEvent];
  'polymarket-wallet:deleted': [event: PolymarketWalletDeletedEvent];
  'polymarket-wallet:default-changed': [event: PolymarketWalletDefaultChangedEvent];
};

export type {
  PolymarketWalletCreatedEvent,
  PolymarketWalletDefaultChangedEvent,
  PolymarketWalletDeletedEvent,
  PolymarketWalletEventMap,
  PolymarketWalletUpdatedEvent,
};
