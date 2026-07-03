CREATE TABLE `app_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`locale_preference` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
