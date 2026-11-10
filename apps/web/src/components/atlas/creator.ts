/**
 * Character-creator choices, derived entirely from the sprite manifest: a
 * slot is offered when it has more than one always-available part
 * (`grantedBy: null`), and every swap group becomes a tone row. Loot parts are
 * never offered here — they are earned, then equipped from the Look picker.
 */
import { defaultSelection, SLOT_ORDER, type SlotId, type SpriteManifest } from "./sprite/manifest";

export type PartChoice = { id: string; label: string };
export type SlotChoices = { slot: SlotId; label: string; options: PartChoice[] };
export type ToneChoice = { id: string; label: string; base: string; shade: string };
export type ToneGroup = { group: string; label: string; tones: ToneChoice[] };
export type Look = { sprite: Partial<Record<SlotId, string>>; tones: Record<string, string> };

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

/** "hair-pigtails" in slot hair → "Pigtails". */
export const partLabel = (id: string, slot: string): string =>
  titleCase(id.startsWith(`${slot}-`) ? id.slice(slot.length + 1) : id);

const SLOT_LABELS: Partial<Record<string, string>> = { body: "Body", hair: "Hair" };
const GROUP_LABELS: Partial<Record<string, string>> = { skin: "Skin tone", hair: "Hair color" };

/** Slots with a real choice among base parts, in layer order. */
export const creatorSlots = (m: SpriteManifest): SlotChoices[] =>
  SLOT_ORDER.flatMap((slot) => {
    const options = m.parts
      .filter((p) => p.slot === slot && p.grantedBy === null)
      .map((p) => ({ id: p.id, label: partLabel(p.id, slot) }));
    return options.length > 1 ? [{ slot, label: SLOT_LABELS[slot] ?? titleCase(slot), options }] : [];
  });

/** Every swap group's tones, in manifest order; swatches show base + shade. */
export const toneGroups = (m: SpriteManifest): ToneGroup[] =>
  Object.entries(m.swapGroups).map(([group, def]) => ({
    group,
    label: GROUP_LABELS[group] ?? titleCase(group),
    tones: Object.entries(def.tones).map(([id, colors]) => ({
      id,
      label: titleCase(id),
      base: colors[0],
      shade: colors[1] ?? colors[0],
    })),
  }));

/** The starting look: the manifest's base selection and each group's first tone. */
export const defaultLook = (m: SpriteManifest): Look => ({
  sprite: defaultSelection(m),
  tones: Object.fromEntries(
    Object.entries(m.swapGroups).flatMap(([g, def]) => {
      const first = Object.keys(def.tones)[0];
      return first ? [[g, first]] : [];
    }),
  ),
});

/** The look as a client Loadout, for previews. */
export const lookLoadout = (look: Look) => ({
  sprite: Object.fromEntries(Object.entries(look.sprite).filter(([, v]) => !!v)) as Record<string, string>,
  tones: look.tones,
});

/**
 * The POST body's `look`: base parts only (anything else is dropped), and
 * only tones the manifest knows.
 */
export const lookBody = (
  m: SpriteManifest,
  look: Look,
): { sprite: Record<string, string>; tones: Record<string, string> } => {
  const sprite: Record<string, string> = {};
  for (const [slot, id] of Object.entries(look.sprite)) {
    if (id && m.parts.some((p) => p.id === id && p.slot === slot && p.grantedBy === null)) {
      sprite[slot] = id;
    }
  }
  const tones: Record<string, string> = {};
  for (const [g, t] of Object.entries(look.tones)) {
    if (m.swapGroups[g]?.tones[t]) tones[g] = t;
  }
  return { sprite, tones };
};
