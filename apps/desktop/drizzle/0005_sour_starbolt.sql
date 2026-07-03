CREATE TABLE `workflow_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload_json` text NOT NULL,
	`result_json` text,
	`error_message` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`next_run_at` text,
	`locked_at` text,
	`locked_by` text,
	`started_at` text,
	`finished_at` text,
	`idempotency_key` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workflow_tasks_idempotency_key_unique` ON `workflow_tasks` (`idempotency_key`) WHERE "workflow_tasks"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_workflow_tasks_due` ON `workflow_tasks` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_tasks_type_status` ON `workflow_tasks` (`type`,`status`);--> statement-breakpoint
ALTER TABLE `polymarket_wallets` ADD `initialization_status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `polymarket_wallets` ADD `initialization_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_polymarket_wallets_initialization_status` ON `polymarket_wallets` (`initialization_status`);