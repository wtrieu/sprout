CREATE TABLE `interests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`brief` text NOT NULL,
	`weight` integer DEFAULT 3 NOT NULL,
	`share` real,
	`source` text DEFAULT 'manual' NOT NULL,
	`tags` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_reinforced_at` integer,
	`last_decayed_at` integer
);
--> statement-breakpoint
CREATE INDEX `interests_kind_status_idx` ON `interests` (`kind`,`status`);