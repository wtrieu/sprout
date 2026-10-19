CREATE TABLE `atlas_bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`node_id` integer NOT NULL,
	`child_id` integer NOT NULL,
	`note` text,
	`target_age_years` integer,
	`kid_status` text DEFAULT 'drafting' NOT NULL,
	`kid_md` text,
	`kid_today` text,
	`kid_age_months` integer,
	`kid_error` text,
	`story_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `atlas_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atlas_bookmarks_node_idx` ON `atlas_bookmarks` (`node_id`);--> statement-breakpoint
CREATE TABLE `atlas_frontier_picks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`map_id` integer NOT NULL,
	`node_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`reason` text NOT NULL,
	`delivered_via` text,
	`email_sent_at` integer,
	`resend_id` text,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `atlas_maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `atlas_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `atlas_frontier_picks_week_idx` ON `atlas_frontier_picks` (`week_start`);--> statement-breakpoint
CREATE INDEX `atlas_frontier_picks_node_idx` ON `atlas_frontier_picks` (`node_id`);--> statement-breakpoint
CREATE TABLE `atlas_maps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`blurb` text,
	`brief` text,
	`status` text DEFAULT 'drafting' NOT NULL,
	`error` text,
	`model` text,
	`created_at` integer NOT NULL,
	`ready_at` integer
);
--> statement-breakpoint
CREATE TABLE `atlas_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`map_id` integer NOT NULL,
	`parent_id` integer,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`blurb` text NOT NULL,
	`kind` text DEFAULT 'concept' NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`skipped_at` integer,
	`visited_at` integer,
	`last_opened_at` integer,
	`visit_count` integer DEFAULT 0 NOT NULL,
	`seed_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `atlas_maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `atlas_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `atlas_nodes_map_parent_idx` ON `atlas_nodes` (`map_id`,`parent_id`,`position`);--> statement-breakpoint
CREATE TABLE `atlas_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`node_id` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`url` text,
	`why` text,
	`status` text NOT NULL,
	`verified_via` text,
	`reject_reason` text,
	`proposed_by` text NOT NULL,
	`snippet` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `atlas_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `atlas_readings_node_status_idx` ON `atlas_readings` (`node_id`,`status`);--> statement-breakpoint
CREATE TABLE `atlas_rungs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`node_id` integer NOT NULL,
	`level` text NOT NULL,
	`status` text DEFAULT 'drafting' NOT NULL,
	`hook` text,
	`body_md` text,
	`word_count` integer,
	`model` text,
	`judge_verdict` text,
	`error` text,
	`started_at` integer NOT NULL,
	`ready_at` integer,
	`read_at` integer,
	`read_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `atlas_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atlas_rungs_node_level_idx` ON `atlas_rungs` (`node_id`,`level`);--> statement-breakpoint
CREATE TABLE `atlas_seeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`kind` text NOT NULL,
	`url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolution` text,
	`node_id` integer,
	`map_id` integer,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`node_id`) REFERENCES `atlas_nodes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`map_id`) REFERENCES `atlas_maps`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `atlas_seeds_status_idx` ON `atlas_seeds` (`status`);