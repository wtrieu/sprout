CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`character_id` integer,
	`arc_id` integer,
	`arc_index` integer,
	`title` text,
	`style` text,
	`form` text,
	`prompt` text NOT NULL,
	`age_months` integer NOT NULL,
	`page_count` integer NOT NULL,
	`character_name` text,
	`character_desc` text,
	`art_notes` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`arc_id`) REFERENCES `story_arcs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_stories`("id", "child_id", "character_id", "arc_id", "arc_index", "title", "style", "form", "prompt", "age_months", "page_count", "character_name", "character_desc", "art_notes", "status", "created_at") SELECT "id", "child_id", "character_id", "arc_id", "arc_index", "title", "style", "form", "prompt", "age_months", "page_count", NULL, NULL, NULL, "status", "created_at" FROM `stories`;--> statement-breakpoint
DROP TABLE `stories`;--> statement-breakpoint
ALTER TABLE `__new_stories` RENAME TO `stories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `story_pages` ADD `motion` text;