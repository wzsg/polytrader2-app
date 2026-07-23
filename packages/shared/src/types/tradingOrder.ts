import type { StrategyPlaceOrderInput } from './strategy.js';

type AccountOrderStatus =
  | 'pending'
  | 'submitting'
  | 'submitted'
  | 'live'
  | 'matched'
  | 'delayed'
  | 'unmatched'
  | 'submit-failed'
  | 'failed'
  | 'rejected'
  | 'canceled';

interface ManualPlaceOrderInput {
  walletId: string;
  orderId: string;
  order: StrategyPlaceOrderInput;
}

interface AccountOrderCreateInput {
  walletId: string;
  orderId: string;
  conditionId: string;
  status: AccountOrderStatus;
  input: StrategyPlaceOrderInput;
  request: Record<string, unknown>;
  submittedAt: string;
}

interface AccountOrderUpdateInput {
  walletId: string;
  orderId: string;
  status: AccountOrderStatus;
  exchangeOrderId?: string | null;
  response?: unknown;
  errorMessage?: string | null;
  completedAt?: string | null;
}

interface AccountOrderExchangeUpdateInput extends Omit<AccountOrderUpdateInput, 'orderId'> {
  exchangeOrderId: string;
}

interface OrderCancellationResult {
  canceled: string[];
  notCanceled: Record<string, string>;
}

export type {
  AccountOrderCreateInput,
  AccountOrderExchangeUpdateInput,
  AccountOrderStatus,
  AccountOrderUpdateInput,
  ManualPlaceOrderInput,
  OrderCancellationResult,
};
