interface PriceHistoryResponse {
  history?: Array<{
    t?: string | number;
    p?: string | number;
  }>;
}

interface BatchPriceHistoryResponse {
  history?: Record<
    string,
    Array<{
      t?: string | number;
      p?: string | number;
    }>
  >;
}

export type { BatchPriceHistoryResponse, PriceHistoryResponse };
