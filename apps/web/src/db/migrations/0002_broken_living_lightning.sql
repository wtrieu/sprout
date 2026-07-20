CREATE TABLE `character_style_refs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` integer NOT NULL,
	`style_key` text NOT NULL,
	`image_path` text,
	`render_attempts` integer DEFAULT 0 NOT NULL,
	`qc_status` text,
	`qc_note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_style_refs_idx` ON `character_style_refs` (`character_id`,`style_key`);--> statement-breakpoint
ALTER TABLE `stories` ADD `style` text;--> statement-breakpoint
ALTER TABLE `story_arcs` ADD `style` text;--> statement-breakpoint
ALTER TABLE `story_pages` ADD `render_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `story_pages` ADD `qc_status` text;--> statement-breakpoint
ALTER TABLE `story_pages` ADD `qc_note` text;