import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { POLYMARKET_CLOB_BASE_URL } from '@polytrader/shared';

export const polymarketWallets = sqliteTable(
  'polymarket_wallets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    creationType: text('creation_type', { enum: ['created', 'imported'] })
      .notNull()
      .default('created'),
    walletKeyMaterial: text('wallet_key_material').notNull(),
    walletKeyMaterialType: text('wallet_key_material_type', {
      enum: ['private_key', 'mnemonic_seed', 'derived_wallet'],
    })
      .notNull()
      .default('private_key'),
    parentWalletId: text('parent_wallet_id'),
    derivationPath: text('derivation_path'),
    walletAddress: text('wallet_address').notNull(),
    apiKey: text('api_key').notNull(),
    secret: text('secret').notNull(),
    passphrase: text('passphrase').notNull(),
    depositWalletAddress: text('deposit_wallet_address').notNull(),
    balance: text('balance'),
    positionsTotalValue: real('positions_total_value'),
    positionsInitialValue: real('positions_initial_value'),
    relayerApiKey: text('relayer_api_key').notNull().default(''),
    signatureType: integer('signature_type').notNull().default(3),
    chainId: integer('chain_id').notNull().default(137),
    clobHost: text('clob_host').notNull().default(POLYMARKET_CLOB_BASE_URL),
    initializationStatus: text('initialization_status', {
      enum: [
        'pending',
        'deriving_credentials',
        'deploying_deposit_wallet',
        'approving_polymarket',
        'ready',
        'failed',
      ],
    })
      .notNull()
      .default('ready'),
    initializationError: text('initialization_error').notNull().default(''),
    keyMaterialBackedUp: integer('key_material_backed_up', { mode: 'boolean' })
      .notNull()
      .default(false),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_polymarket_wallets_default').on(table.isDefault),
    index('idx_polymarket_wallets_name').on(table.name),
    index('idx_polymarket_wallets_parent_wallet_id').on(table.parentWalletId),
    index('idx_polymarket_wallets_initialization_status').on(table.initializationStatus),
    foreignKey({
      columns: [table.parentWalletId],
      foreignColumns: [table.id],
      name: 'polymarket_wallets_parent_wallet_id_fk',
    }).onDelete('restrict'),
  ],
);

export const polymarketWithdrawals = sqliteTable(
  'polymarket_withdrawals',
  {
    id: text('id').primaryKey(),
    walletId: text('wallet_id').notNull(),
    walletAddress: text('wallet_address').notNull(),
    depositWalletAddress: text('deposit_wallet_address').notNull(),
    amount: text('amount').notNull(),
    amountBaseUnits: text('amount_base_units').notNull(),
    fromChainId: text('from_chain_id').notNull(),
    fromTokenAddress: text('from_token_address').notNull(),
    toChainId: text('to_chain_id').notNull(),
    toTokenAddress: text('to_token_address').notNull(),
    recipientAddress: text('recipient_address').notNull(),
    bridgeAddress: text('bridge_address'),
    status: text('status', {
      enum: [
        'pending',
        'creating_bridge_address',
        'transferring_pusd',
        'waiting_bridge_completion',
        'succeeded',
        'failed',
        'timed_out',
      ],
    })
      .notNull()
      .default('pending'),
    bridgeResponseJson: text('bridge_response_json'),
    bridgeStatus: text('bridge_status'),
    bridgeStatusResponseJson: text('bridge_status_response_json'),
    relayerTransactionId: text('relayer_transaction_id'),
    relayerTransactionState: text('relayer_transaction_state'),
    relayerTransactionHash: text('relayer_transaction_hash'),
    errorMessage: text('error_message'),
    submittedAt: text('submitted_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_polymarket_withdrawals_wallet_created').on(table.walletId, table.createdAt),
    index('idx_polymarket_withdrawals_status').on(table.status),
    index('idx_polymarket_withdrawals_bridge_address').on(table.bridgeAddress),
    foreignKey({
      columns: [table.walletId],
      foreignColumns: [polymarketWallets.id],
      name: 'polymarket_withdrawals_wallet_id_fk',
    }).onDelete('restrict'),
  ],
);
