CREATE TABLE `event_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`phase` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`duration_ms` integer,
	`pages_fetched` integer DEFAULT 0 NOT NULL,
	`events_fetched` integer DEFAULT 0 NOT NULL,
	`ids_checked` integer DEFAULT 0 NOT NULL,
	`events_upserted` integer DEFAULT 0 NOT NULL,
	`events_skipped` integer DEFAULT 0 NOT NULL,
	`markets_upserted` integer DEFAULT 0 NOT NULL,
	`tags_upserted` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`error_detail_json` text,
	`stage_summary_json` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_event_sync_runs_started_at` ON `event_sync_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_event_sync_runs_status` ON `event_sync_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_event_sync_runs_trigger` ON `event_sync_runs` (`trigger`);