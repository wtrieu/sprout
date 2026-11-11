/**
 * The sprite style the app renders: the folder under public/sprite/ whose
 * manifest decides which parts exist. One constant so the server (loadout
 * rules, character creation) and the client (the sprite canvas) can never
 * disagree. "classic" is the placeholder set; "atlas" is the real art.
 */
export const RENDERED_SPRITE_STYLE = "atlas" as const;
