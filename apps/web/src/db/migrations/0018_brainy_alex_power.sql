DROP INDEX `atlas_frontier_picks_week_idx`;--> statement-breakpoint
ALTER TABLE `atlas_frontier_picks` ADD `attempt` integer;--> statement-breakpoint
-- Backfill: earlier --force re-runs left several rows per week; number them
-- 0, 1, 2… in id order so every existing row is guarded and unique.
UPDATE `atlas_frontier_picks` SET `attempt` = (SELECT count(*) FROM `atlas_frontier_picks` AS `p2` WHERE `p2`.`week_start` = `atlas_frontier_picks`.`week_start` AND `p2`.`id` < `atlas_frontier_picks`.`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `atlas_frontier_picks_week_attempt_idx` ON `atlas_frontier_picks` (`week_start`,`attempt`);--> statement-breakpoint
ALTER TABLE `atlas_bookmarks` ADD `kid_started_at` integer;--> statement-breakpoint
-- Backfill: a kid draft already in flight gets its row's creation time, so
-- the reaper judges it by age rather than treating a null stamp as stale.
UPDATE `atlas_bookmarks` SET `kid_started_at` = `created_at` WHERE `kid_status` = 'drafting';
