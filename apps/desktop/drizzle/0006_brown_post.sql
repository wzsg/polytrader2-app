DROP TABLE `event_sync_runs`;--> statement-breakpoint
ALTER TABLE `workflow_tasks` ADD `group_key` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
UPDATE `workflow_tasks` SET `group_key` = `type` WHERE `group_key` = 'default';--> statement-breakpoint
CREATE INDEX `idx_workflow_tasks_group_status` ON `workflow_tasks` (`group_key`,`status`,`next_run_at`);
