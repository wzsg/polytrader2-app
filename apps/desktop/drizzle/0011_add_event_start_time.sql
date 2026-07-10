ALTER TABLE `events` ADD `start_time` text;--> statement-breakpoint
CREATE INDEX `idx_events_active_closed_parent_start_time` ON `events` (`active`,`closed`,`parent_event_id`,`start_time`);
