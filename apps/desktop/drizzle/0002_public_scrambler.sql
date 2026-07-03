DELETE FROM `markets`;
--> statement-breakpoint
ALTER TABLE `markets` ADD `negative_risk` integer NOT NULL;
