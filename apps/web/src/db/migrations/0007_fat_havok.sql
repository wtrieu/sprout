CREATE TABLE `premises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`title` text NOT NULL,
	`lane` text NOT NULL,
	`pitch` text NOT NULL,
	`tags` text NOT NULL,
	`lesson` text DEFAULT 'none' NOT NULL,
	`lesson_note` text,
	`seed_ref` text,
	`world_ref` text,
	`form` text,
	`length_pages` integer NOT NULL,
	`why_for_jun` text,
	`score` real,
	`status` text DEFAULT 'proposed' NOT NULL,
	`pass_reason` text,
	`judge_verdict` text,
	`story_id` integer,
	`engine_version` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `premises_status_idx` ON `premises` (`status`);--> statement-breakpoint
ALTER TABLE `stories` ADD `lane` text;--> statement-breakpoint
ALTER TABLE `stories` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `stories` ADD `lesson` text;--> statement-breakpoint
ALTER TABLE `stories` ADD `reject_reason` text;--> statement-breakpoint
ALTER TABLE `stories` ADD `reject_note` text;--> statement-breakpoint
ALTER TABLE `stories` ADD `epitaph` text;--> statement-breakpoint
ALTER TABLE `stories` ADD `engine_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD `premise_id` integer;