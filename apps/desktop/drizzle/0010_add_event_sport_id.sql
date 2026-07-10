ALTER TABLE `events` ADD `sport_id` text;--> statement-breakpoint
CREATE INDEX `idx_events_sport_id` ON `events` (`sport_id`);
