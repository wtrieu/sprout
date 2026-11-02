CREATE TABLE `atlas_achievements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`flavor` text NOT NULL,
	`source` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`data` text,
	`granted_at` integer NOT NULL,
	`revealed_at` integer,
	FOREIGN KEY (`player_id`) REFERENCES `atlas_players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atlas_achievements_player_slug_idx` ON `atlas_achievements` (`player_id`,`slug`);--> statement-breakpoint
CREATE INDEX `atlas_achievements_pending_idx` ON `atlas_achievements` (`player_id`,`revealed_at`);--> statement-breakpoint
CREATE TABLE `atlas_class_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`gate_level` integer NOT NULL,
	`options` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`choice` text,
	`deadline` integer,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`player_id`) REFERENCES `atlas_players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atlas_class_offers_player_gate_idx` ON `atlas_class_offers` (`player_id`,`gate_level`);--> statement-breakpoint
CREATE TABLE `atlas_engine_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text DEFAULT 'nightly' NOT NULL,
	`status` text DEFAULT 'drafting' NOT NULL,
	`error` text,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`grants_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atlas_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`achievement_id` integer,
	`kind` text NOT NULL,
	`ref` text,
	`status` text DEFAULT 'owned' NOT NULL,
	`created_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`player_id`) REFERENCES `atlas_players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievement_id`) REFERENCES `atlas_achievements`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `atlas_items_player_status_idx` ON `atlas_items` (`player_id`,`status`);--> statement-breakpoint
ALTER TABLE `atlas_nodes` ADD `rare` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `atlas_players` ADD `loadout` text;