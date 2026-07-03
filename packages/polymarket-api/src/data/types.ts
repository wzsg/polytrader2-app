interface DataApiTrade {
  id?: string | number;
  tradeId?: string | number;
  asset?: string;
  tokenId?: string;
  outcome?: string;
  side?: string;
  price?: string | number;
  size?: string | number;
  timestamp?: string | number;
  transactionHash?: string;
}

export type { DataApiTrade };
