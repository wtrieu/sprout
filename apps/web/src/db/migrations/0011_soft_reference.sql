-- Raw illustration layers are now persisted so a page prompt can always be
-- recomposed when the composer changes (previously only the composed string
-- survived, which made prompt fixes unbackfillable).
ALTER TABLE `story_pages` ADD `scene` text;--> statement-breakpoint
ALTER TABLE `story_pages` ADD `background` text;--> statement-breakpoint
ALTER TABLE `stories` ADD `hidden_friend` text;--> statement-breakpoint
-- --cref is a V6/Niji-6 parameter and is unsupported on the current models
-- (Niji 7, V8). The page-1 reference URL now rides as --sref, which is
-- supported on both families, so the column name follows.
ALTER TABLE `stories` RENAME COLUMN `cref_url` TO `style_ref_url`;
