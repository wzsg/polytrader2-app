CREATE TABLE `wallet_orders` (
	`wallet_id` text NOT NULL,
	`order_id` text NOT NULL,
	`condition_id` text NOT NULL,
	`market_id` text,
	`event_id` text,
	`exchange_order_id` text,
	`active` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`order_type` text,
	`side` text,
	`asset_id` text,
	`outcome` text,
	`price` text,
	`shares` text,
	`size_matched` text,
	`amount` text,
	`created_at` integer,
	`input_json` text,
	`request_json` text,
	`response_json` text,
	`error_message` text,
	`owner` text,
	`maker_address` text,
	`expiration` text,
	`associate_trades_json` text,
	`submitted_at` text,
	`completed_at` text,
	`first_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_seen_at` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`wallet_id`, `order_id`),
	FOREIGN KEY (`wallet_id`) REFERENCES `polymarket_wallets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "wallet_orders_status_check" CHECK("wallet_orders"."status" IN ('pending', 'submitting', 'submitted', 'live', 'matched', 'delayed', 'unmatched', 'submit-failed', 'failed', 'rejected', 'canceled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wallet_orders_exchange_order_id_unique` ON `wallet_orders` (`exchange_order_id`) WHERE "wallet_orders"."exchange_order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_wallet_orders_wallet_active` ON `wallet_orders` (`wallet_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_wallet_orders_wallet_condition_active` ON `wallet_orders` (`wallet_id`,`condition_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_wallet_orders_wallet_market` ON `wallet_orders` (`wallet_id`,`market_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_orders_wallet_event` ON `wallet_orders` (`wallet_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_orders_last_seen` ON `wallet_orders` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `wallet_positions` (
	`wallet_id` text NOT NULL,
	`position_id` text NOT NULL,
	`condition_id` text,
	`market_id` text,
	`event_id` text,
	`active` integer DEFAULT true NOT NULL,
	`proxy_wallet` text,
	`asset` text,
	`size` real,
	`avg_price` real,
	`initial_value` real,
	`current_value` real,
	`cash_pnl` real,
	`percent_pnl` real,
	`total_bought` real,
	`realized_pnl` real,
	`percent_realized_pnl` real,
	`cur_price` real,
	`redeemable` integer,
	`mergeable` integer,
	`title` text,
	`slug` text,
	`icon` text,
	`event_slug` text,
	`outcome` text,
	`outcome_index` integer,
	`opposite_outcome` text,
	`opposite_asset` text,
	`end_date` text,
	`negative_risk` integer,
	`first_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_seen_at` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`wallet_id`, `position_id`),
	FOREIGN KEY (`wallet_id`) REFERENCES `polymarket_wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_wallet_positions_wallet_active` ON `wallet_positions` (`wallet_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_wallet_positions_wallet_condition` ON `wallet_positions` (`wallet_id`,`condition_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_positions_wallet_market` ON `wallet_positions` (`wallet_id`,`market_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_positions_wallet_event` ON `wallet_positions` (`wallet_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_positions_last_seen` ON `wallet_positions` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `wallet_trades` (
	`wallet_id` text NOT NULL,
	`trade_id` text NOT NULL,
	`condition_id` text,
	`market_id` text,
	`event_id` text,
	`taker_order_id` text,
	`asset_id` text,
	`side` text,
	`size` text,
	`fee_rate_bps` text,
	`price` text,
	`status` text,
	`match_time` text,
	`last_update` text,
	`outcome` text,
	`bucket_index` integer,
	`owner` text,
	`maker_address` text,
	`transaction_hash` text,
	`trader_side` text,
	`maker_orders_json` text,
	`first_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`wallet_id`, `trade_id`),
	FOREIGN KEY (`wallet_id`) REFERENCES `polymarket_wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_wallet_trades_wallet_match_time` ON `wallet_trades` (`wallet_id`,`match_time`);--> statement-breakpoint
CREATE INDEX `idx_wallet_trades_wallet_condition` ON `wallet_trades` (`wallet_id`,`condition_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_trades_wallet_market` ON `wallet_trades` (`wallet_id`,`market_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_trades_wallet_event` ON `wallet_trades` (`wallet_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_tags` (
	`event_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`label` text,
	`slug` text,
	PRIMARY KEY(`event_id`, `tag_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_event_tags_tag_id` ON `event_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`image` text,
	`volume` real DEFAULT 0,
	`volume24hr` real DEFAULT 0,
	`liquidity` real DEFAULT 0,
	`active` integer DEFAULT true NOT NULL,
	`closed` integer DEFAULT false NOT NULL,
	`market_count` integer DEFAULT 0,
	`start_date` text,
	`end_date` text,
	`category` text,
	`featured` integer DEFAULT false,
	`parent_event_id` text,
	`teams` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_events_volume24hr` ON `events` (`volume24hr`);--> statement-breakpoint
CREATE INDEX `idx_events_active` ON `events` (`active`);--> statement-breakpoint
CREATE INDEX `idx_events_parent_event_id` ON `events` (`parent_event_id`);--> statement-breakpoint
CREATE TABLE `markets` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`question` text,
	`slug` text,
	`group_item_title` text,
	`condition_id` text,
	`image` text,
	`icon` text,
	`active` integer DEFAULT false NOT NULL,
	`closed` integer DEFAULT false NOT NULL,
	`outcomes` text,
	`outcome_prices` text,
	`clob_token_ids` text,
	`clob_token_ids_0` text,
	`clob_token_ids_1` text,
	`outcomes_0` text,
	`outcomes_1` text,
	`outcome_prices_0` text,
	`outcome_prices_1` text,
	`volume` real DEFAULT 0,
	`volume24hr` real DEFAULT 0,
	`liquidity` real DEFAULT 0,
	`updated_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_markets_event_id` ON `markets` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_markets_condition_id_unique` ON `markets` (`condition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_markets_clob_token_ids_0_unique` ON `markets` (`clob_token_ids_0`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_markets_clob_token_ids_1_unique` ON `markets` (`clob_token_ids_1`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`event_id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_watchlist_created_at` ON `watchlist` (`created_at`);--> statement-breakpoint
CREATE TABLE `polymarket_wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`creation_type` text DEFAULT 'created' NOT NULL,
	`wallet_key_material` text NOT NULL,
	`wallet_key_material_type` text DEFAULT 'private_key' NOT NULL,
	`parent_wallet_id` text,
	`derivation_path` text,
	`wallet_address` text NOT NULL,
	`api_key` text NOT NULL,
	`secret` text NOT NULL,
	`passphrase` text NOT NULL,
	`deposit_wallet_address` text NOT NULL,
	`balance` text,
	`positions_total_value` real,
	`positions_initial_value` real,
	`relayer_api_key` text DEFAULT '' NOT NULL,
	`signature_type` integer DEFAULT 3 NOT NULL,
	`chain_id` integer DEFAULT 137 NOT NULL,
	`clob_host` text DEFAULT 'https://clob.polymarket.com' NOT NULL,
	`key_material_backed_up` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`parent_wallet_id`) REFERENCES `polymarket_wallets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_polymarket_wallets_default` ON `polymarket_wallets` (`is_default`);--> statement-breakpoint
CREATE INDEX `idx_polymarket_wallets_name` ON `polymarket_wallets` (`name`);--> statement-breakpoint
CREATE INDEX `idx_polymarket_wallets_parent_wallet_id` ON `polymarket_wallets` (`parent_wallet_id`);--> statement-breakpoint
CREATE TABLE `strategies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`source_code` text NOT NULL,
	`compiled_code` text,
	`compile_status` text DEFAULT 'pending' NOT NULL,
	`compile_error` text,
	`deleted_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_strategies_deleted_at` ON `strategies` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_strategies_name` ON `strategies` (`name`);--> statement-breakpoint
CREATE TABLE `strategy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`strategy_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`source_code` text NOT NULL,
	`compiled_code` text,
	`compile_status` text NOT NULL,
	`compile_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_strategy_versions_strategy_id` ON `strategy_versions` (`strategy_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_versions_version` ON `strategy_versions` (`strategy_id`,`version`);--> statement-breakpoint
CREATE TABLE `strategy_bots` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`market_id` text NOT NULL,
	`event_id` text NOT NULL,
	`condition_id` text,
	`asset_id` text NOT NULL,
	`strategy_id` text NOT NULL,
	`strategy_version` integer NOT NULL,
	`wallet_id` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`auto_start` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`active_run_id` text,
	`runtime_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`wallet_id`) REFERENCES `polymarket_wallets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_strategy_bots_market_id` ON `strategy_bots` (`market_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_strategy_bots_name_unique` ON `strategy_bots` (`name`);--> statement-breakpoint
CREATE INDEX `idx_strategy_bots_event_id` ON `strategy_bots` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_bots_strategy_id` ON `strategy_bots` (`strategy_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_bots_wallet_id` ON `strategy_bots` (`wallet_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_bots_status` ON `strategy_bots` (`status`);--> statement-breakpoint
CREATE INDEX `idx_strategy_bots_auto_start` ON `strategy_bots` (`auto_start`,`enabled`);--> statement-breakpoint
CREATE TABLE `strategy_run_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`level` text NOT NULL,
	`module` text DEFAULT 'strategy' NOT NULL,
	`message` text NOT NULL,
	`time` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `strategy_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_strategy_run_logs_run_id` ON `strategy_run_logs` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_run_logs_time` ON `strategy_run_logs` (`time`);--> statement-breakpoint
CREATE TABLE `strategy_run_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`wallet_id` text NOT NULL,
	`strategy_id` text NOT NULL,
	`strategy_version` integer NOT NULL,
	`market_id` text NOT NULL,
	`condition_id` text,
	`input` text NOT NULL,
	`request` text NOT NULL,
	`response` text,
	`success` integer DEFAULT false NOT NULL,
	`exchange_order_id` text,
	`status` text,
	`error_message` text,
	`submitted_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `strategy_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wallet_id`) REFERENCES `polymarket_wallets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_strategy_run_orders_run_id` ON `strategy_run_orders` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_run_orders_wallet_id` ON `strategy_run_orders` (`wallet_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_run_orders_market_id` ON `strategy_run_orders` (`market_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_run_orders_condition_id` ON `strategy_run_orders` (`condition_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_run_orders_submitted_at` ON `strategy_run_orders` (`submitted_at`);--> statement-breakpoint
CREATE TABLE `strategy_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`bot_id` text,
	`market_id` text NOT NULL,
	`event_id` text NOT NULL,
	`condition_id` text,
	`market_snapshot` text NOT NULL,
	`outcomes_snapshot` text NOT NULL,
	`asset_id` text NOT NULL,
	`strategy_id` text NOT NULL,
	`strategy_name` text NOT NULL,
	`strategy_version` integer NOT NULL,
	`strategy_source_code` text NOT NULL,
	`compiled_code` text NOT NULL,
	`wallet_id` text NOT NULL,
	`wallet_name` text NOT NULL,
	`status` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`runtime_error` text,
	`started_at` text NOT NULL,
	`stopped_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`bot_id`) REFERENCES `strategy_bots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`strategy_id`) REFERENCES `strategies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`wallet_id`) REFERENCES `polymarket_wallets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_strategy_runs_market_status` ON `strategy_runs` (`market_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_strategy_runs_event_id` ON `strategy_runs` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_runs_bot_id` ON `strategy_runs` (`bot_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_runs_strategy_id` ON `strategy_runs` (`strategy_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_runs_wallet_id` ON `strategy_runs` (`wallet_id`);--> statement-breakpoint
CREATE INDEX `idx_strategy_runs_started_at` ON `strategy_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `mcp_server_access_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`session_id` text,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status_code` integer,
	`rpc_method` text,
	`tool_name` text,
	`resource_uri` text,
	`success` integer NOT NULL,
	`duration_ms` integer,
	`client_host` text,
	`user_agent` text,
	`error_code` integer,
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_server_access_logs_request_id` ON `mcp_server_access_logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_mcp_server_access_logs_session_id` ON `mcp_server_access_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_mcp_server_access_logs_rpc_method` ON `mcp_server_access_logs` (`rpc_method`);--> statement-breakpoint
CREATE INDEX `idx_mcp_server_access_logs_tool_name` ON `mcp_server_access_logs` (`tool_name`);--> statement-breakpoint
CREATE INDEX `idx_mcp_server_access_logs_created_at` ON `mcp_server_access_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mcp_server_access_logs_success` ON `mcp_server_access_logs` (`success`);
