ALTER TABLE `events` ADD `ended` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_events_active_closed_ended_parent_start_time` ON `events` (`active`,`closed`,`ended`,`parent_event_id`,`start_time`);
