import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChestBanner, RevealModal } from "./RevealModal";
import { AchievementGallery, Inventory } from "./Collection";
import { levelLine } from "./CharacterCard";
import { loadoutPatch, type Pending } from "./loadout";

const OPTION = (n: number) => ({
  classId: `class-${n}`,
  title: `Title ${n}`,
  affinity: "reasoning",
  style: "scholar",
  blurb: `Blurb ${n}`,
  perk: `Perk ${n}`,
});

const PENDING: Pending = {
  achievements: [
    {
      id: 1,
      slug: "first-stamp",
      title: "First Stamp",
      flavor: "You earned your first stamp.",
      hidden: false,
      items: [{ id: 10, kind: "sprite_part", ref: "cape-scholar" }],
    },
  ],
  offer: {
    id: 5,
    gateLevel: 10,
    options: [OPTION(1), OPTION(2), null],
    deadline: null,
    status: "revealed",
  },
};

const modal = (pending: Pending) =>
  renderToStaticMarkup(
    <RevealModal
      pending={pending}
      persona="cartographer"
      name="Sam"
      seed="m1"
      onClose={() => {}}
      onChoose={() => {}}
    />,
  );

describe("RevealModal", () => {
  it("opens on the first achievement with its flavor and loot", () => {
    const html = modal(PENDING);
    expect(html).toContain("First Stamp");
    expect(html).toContain("You earned your first stamp.");
    expect(html).toContain("cape scholar");
    expect(html).toContain("1 / 2");
    expect(html).toContain("Next");
    expect(html).not.toContain("Perk 1");
  });

  it("shows the class offer card: options, perks, default mark, soft deadline", () => {
    const html = modal({ achievements: [], offer: PENDING.offer });
    expect(html).toContain("Title 1");
    expect(html).toContain("Title 2");
    expect(html).toContain("Perk 1");
    expect(html).toContain("Perk 2");
    expect(html.match(/default/g)?.length).toBe(1);
    expect(html).toContain("No rush");
    expect(html).toContain("Decide later");
    // The null wildcard slot renders nothing.
    expect(html.match(/Become /g)?.length).toBe(2);
  });

  it("renders nothing when there is nothing to reveal", () => {
    expect(modal({ achievements: [], offer: null })).toBe("");
  });
});

describe("ChestBanner", () => {
  it("counts chests and mentions the offer", () => {
    const html = renderToStaticMarkup(<ChestBanner pending={PENDING} onOpen={() => {}} />);
    expect(html).toContain("1 chest and a title offer");
  });
});

describe("collection pieces", () => {
  it("hides queued achievements and shows revealed ones with flavor", () => {
    const html = renderToStaticMarkup(
      <AchievementGallery
        achievements={[
          { id: 1, slug: "a", title: "Seen One", flavor: "Shown.", hidden: true, revealedAt: "2026-11-01" },
          { id: 2, slug: "b", title: "Queued One", flavor: "Secret.", hidden: true, revealedAt: null },
        ]}
      />,
    );
    expect(html).toContain("Seen One");
    expect(html).toContain("Shown.");
    expect(html).not.toContain("Queued One");
  });

  it("offers Use only on functional items", () => {
    const html = renderToStaticMarkup(
      <Inventory
        onUse={() => {}}
        items={[
          { id: 1, kind: "frame", ref: "frame-oak", status: "owned" },
          { id: 2, kind: "respec_token", ref: "respec", status: "owned" },
          { id: 3, kind: "fog_reveal", ref: "fog", status: "consumed" },
        ]}
      />,
    );
    expect(html.match(/>Use</g)?.length).toBe(1);
    expect(html).toContain("Oak frame");
    expect(html).not.toContain("Fog reveal");
  });

  it("formats the level line with the next gate", () => {
    expect(levelLine(12, { level: 20, at: 0 })).toBe("Total level 12 · next offer at 20");
    expect(levelLine(250, null)).toBe("Total level 250");
  });
});

describe("loadout unequip", () => {
  it("serializes cleared slots as explicit null and omits untouched ones", () => {
    const saved = {
      frame: "frame-oak",
      mapStyle: "style-night",
      sprite: { cape: "cape-scholar", hair: "hair-short" },
    };
    const draft = { frame: undefined, mapStyle: "style-night", sprite: { hair: "hair-short" } };
    const body = JSON.parse(JSON.stringify({ loadout: loadoutPatch(saved, draft) }));
    expect(body).toEqual({ loadout: { frame: null, sprite: { cape: null } } });
    expect(loadoutPatch(saved, saved)).toEqual({});
  });
});
