CREATE TABLE `atlas_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`verb` text NOT NULL,
	`map_id` integer,
	`node_id` integer,
	`data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `atlas_players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_id`) REFERENCES `atlas_maps`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`node_id`) REFERENCES `atlas_nodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `atlas_events_player_idx` ON `atlas_events` (`player_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `atlas_events_verb_idx` ON `atlas_events` (`verb`);--> statement-breakpoint
CREATE TABLE `atlas_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`persona` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atlas_players_email_unique` ON `atlas_players` (`email`);--> statement-breakpoint
ALTER TABLE `atlas_nodes` ADD `discipline` text;