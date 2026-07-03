CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`materials` text NOT NULL,
	`milestone_refs` text,
	`age_months` integer NOT NULL,
	`status` text DEFAULT 'suggested' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`appearance_desc` text NOT NULL,
	`ref_image_path` text,
	`seed` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`citations` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_session_idx` ON `chat_messages` (`session_id`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer,
	`title` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `children` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`dob` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` blob,
	`token_count` integer,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_document_idx` ON `chunks` (`document_id`);--> statement-breakpoint
CREATE TABLE `crawl_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`docs_seen` integer DEFAULT 0 NOT NULL,
	`docs_new` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `digests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`age_months` integer NOT NULL,
	`content_md` text NOT NULL,
	`sent_at` integer,
	`resend_id` text,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`url` text,
	`title` text NOT NULL,
	`published_at` integer,
	`fetched_at` integer NOT NULL,
	`content_hash` text NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`age_min_months` integer,
	`age_max_months` integer,
	`topics` text,
	`relevance` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_source_external_idx` ON `documents` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `documents_relevance_idx` ON `documents` (`relevance`);--> statement-breakpoint
CREATE TABLE `growth_lms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sex` text NOT NULL,
	`measure` text NOT NULL,
	`x` real NOT NULL,
	`l` real NOT NULL,
	`m` real NOT NULL,
	`s` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `growth_lms_lookup_idx` ON `growth_lms` (`measure`,`sex`,`x`);--> statement-breakpoint
CREATE TABLE `job_lock` (
	`id` integer PRIMARY KEY NOT NULL,
	`locked_by` text,
	`locked_at` integer
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`lane` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`status`,`lane`,`priority`);--> statement-breakpoint
CREATE TABLE `materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materials_slug_unique` ON `materials` (`slug`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain` text NOT NULL,
	`age_months` integer NOT NULL,
	`description` text NOT NULL,
	`source_ref` text,
	`external_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_external_id_unique` ON `milestones` (`external_id`);--> statement-breakpoint
CREATE TABLE `source_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`reason` text,
	`found_in_document_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`found_in_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_suggestions_url_unique` ON `source_suggestions` (`url`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`license` text,
	`fetch_policy` text DEFAULT 'full_text' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`last_fetched_at` integer,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_slug_unique` ON `sources` (`slug`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`character_id` integer NOT NULL,
	`title` text,
	`prompt` text NOT NULL,
	`age_months` integer NOT NULL,
	`page_count` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `story_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`page_index` integer NOT NULL,
	`text` text NOT NULL,
	`illustration_prompt` text NOT NULL,
	`image_path` text,
	`image_status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `story_pages_story_page_idx` ON `story_pages` (`story_id`,`page_index`);--> statement-breakpoint
CREATE TABLE `user_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`material_id` integer NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_materials_material_id_unique` ON `user_materials` (`material_id`);