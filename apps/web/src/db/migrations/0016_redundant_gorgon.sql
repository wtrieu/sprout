CREATE TABLE `atlas_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`node_id` integer NOT NULL,
	`slug` text NOT NULL,
	`query` text NOT NULL,
	`caption` text,
	`why` text,
	`status` text NOT NULL,
	`file_title` text,
	`verified_via` text,
	`url` text,
	`thumb_url` text,
	`desc_url` text,
	`author` text,
	`license` text,
	`width` integer,
	`height` integer,
	`reject_reason` text,
	`proposed_by` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `atlas_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `atlas_images_node_status_idx` ON `atlas_images` (`node_id`,`status`);--> statement-breakpoint
ALTER TABLE `atlas_rungs` ADD `visuals_json` text;