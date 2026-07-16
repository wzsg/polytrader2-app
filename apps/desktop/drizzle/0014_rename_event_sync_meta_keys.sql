INSERT INTO `app_meta` (`key`, `value`)
SELECT 'event_sync_schedule_config', `value`
FROM `app_meta`
WHERE `key` = 'sync_schedule_config'
  AND NOT EXISTS (
    SELECT 1 FROM `app_meta` WHERE `key` = 'event_sync_schedule_config'
  );
--> statement-breakpoint
DELETE FROM `app_meta` WHERE `key` = 'sync_schedule_config';
--> statement-breakpoint
INSERT INTO `app_meta` (`key`, `value`)
SELECT 'last_event_sync_at', `value`
FROM `app_meta`
WHERE `key` = 'last_sync_at'
  AND NOT EXISTS (
    SELECT 1 FROM `app_meta` WHERE `key` = 'last_event_sync_at'
  );
--> statement-breakpoint
DELETE FROM `app_meta` WHERE `key` = 'last_sync_at';
