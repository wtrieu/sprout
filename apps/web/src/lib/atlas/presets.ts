/**
 * Map presets: the brief the drafter receives for a field the owner asked
 * for by name. A preset is a bar to clear and a list of anchors that must
 * appear, not an outline — the model still decides the branches and the
 * children, which is the whole point of drafting rather than seeding.
 */

export type MapPreset = {
  key: string;
  title: string;
  brief: string;
};

export const PHILOSOPHY_BRIEF = `THE BAR: this map must beat a good bookstore "history of philosophy" — the kind
with a timeline up front and one spread per school. Ours is better because
every node states the live question it answers, every one-pager is written
for one curious adult rather than a shelf, and the reader can wander instead
of reading front to back.

MUST APPEAR as branches or as children (merge or split them as the history
demands, never drop them): the Pre-Socratics; Socrates, Plato and Aristotle;
the Hellenistic schools (Stoicism, Epicureanism, Skepticism, Cynicism);
Buddhism; Confucianism; Daoism; the medieval synthesis (Augustine, Aquinas,
the Islamic and Jewish philosophers); Rationalism and Empiricism; Kant;
Utilitarianism; Existentialism; Pragmatism; Analytic and Continental
philosophy; and at least one thread from outside Europe and Asia
(for example Africana or Indigenous philosophy).

TREAT non-Western traditions as first-class branches with their own internal
debates, not as a single "Eastern" appendix.

EACH CHILD is a school, a thinker, a concept, or a text. Its blurb is the live
question it answers ("Can a life be good if it ends badly?"), never a
dictionary definition.`;

export const presets: Record<string, MapPreset> = {
  philosophy: {
    key: "philosophy",
    title: "Philosophy",
    brief: PHILOSOPHY_BRIEF,
  },
};

export const presetKeys = Object.keys(presets) as Array<keyof typeof presets>;

export const getPreset = (key: string | null | undefined): MapPreset | null =>
  key ? (presets[key] ?? null) : null;
