/**
 * DOM↔canvas bridge for the finale: the CTA button registers itself here so
 * the WishMote (inside the R3F root) can fly to it and settle into its ❋.
 * Module-level ref — no React plumbing across the two React roots.
 */
export const moteTarget: { el: HTMLElement | null } = { el: null };
