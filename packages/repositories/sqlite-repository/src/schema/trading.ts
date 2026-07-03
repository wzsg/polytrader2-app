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
      enum: ['pending', 'deriving_credentials', 'deploying_deposit_wallet', 'ready', 'failed'],
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
