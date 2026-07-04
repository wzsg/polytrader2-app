CREATE INDEX `idx_event_tags_tag_event` ON `event_tags` (`tag_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_events_active_closed_parent_end` ON `events` (`active`,`closed`,`parent_event_id`,`end_date`);
