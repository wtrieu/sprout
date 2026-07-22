/**
 * Key-value app settings with a Zod whitelist: only keys registered here can
 * be read or written, and values are validated on both sides. Storage is the
 * `settings` table (opaque JSON per key).
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { settings, children } from "../db/schema";
import { ageInMonths } from "./age";

export const settingSchemas = {
  /** Target reading level for nightly story candidates. */
  storyAgeTarget: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("auto") }),
    z.object({ mode: z.literal("manual"), months: z.number().int().min(6).max(72) }),
  ]),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

export const settingKeys = Object.keys(settingSchemas) as SettingKey[];

const DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  storyAgeTarget: { mode: "auto" },
};

export const getSetting = <K extends SettingKey>(db: DB, key: K): SettingValue<K> => {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return DEFAULTS[key];
  const parsed = settingSchemas[key].safeParse(row.value);
  return parsed.success ? (parsed.data as SettingValue<K>) : DEFAULTS[key];
};

export const setSetting = <K extends SettingKey>(
  db: DB,
  key: K,
  value: SettingValue<K>,
): void => {
  const parsed = settingSchemas[key].parse(value);
  db.insert(settings)
    .values({ key, value: parsed, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: parsed, updatedAt: new Date() },
    })
    .run();
};

/** The age (in months) story generation should write for. */
export const resolveStoryAgeMonths = (db: DB): number => {
  const target = getSetting(db, "storyAgeTarget");
  if (target.mode === "manual") return target.months;
  const child = db.select().from(children).limit(1).get();
  return child ? ageInMonths(child.dob) : 24;
};
