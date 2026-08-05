ALTER TABLE `stories` ADD `read_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD `last_read_at` integer;