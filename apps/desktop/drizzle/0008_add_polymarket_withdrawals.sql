CREATE TABLE `polymarket_withdrawals` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`wallet_address` text NOT NULL,
	`deposit_wallet_address` text NOT NULL,
	`amount` text NOT NULL,
	`amount_base_units` text NOT NULL,
	`from_chain_id` text NOT NULL,
	`from_token_address` text NOT NULL,
	`to_chain_id` text NOT NULL,
	`to_token_address` text NOT NULL,
	`recipient_address` text NOT NULL,
	`bridge_address` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`bridge_response_json` text,
	`bridge_status` text,
	`bridge_status_response_json` text,
	`relayer_transaction_id` text,
	`relayer_transaction_state` text,
	`relayer_transaction_hash` text,
	`error_message` text,
	`submitted_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `polymarket_wallets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_polymarket_withdrawals_wallet_created` ON `polymarket_withdrawals` (`wallet_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_polymarket_withdrawals_status` ON `polymarket_withdrawals` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_polymarket_withdrawals_bridge_address` ON `polymarket_withdrawals` (`bridge_address`);
