/**
 * Seed household materials used by the activity generator (mirror of Pulse's
 * equipment pattern). Mark what you own in the /materials UI.
 */
import { db } from "../apps/web/src/db/client";
import { materials } from "../apps/web/src/db/schema";

const rows: Array<{ slug: string; name: string; category: string }> = [
  // toys
  { slug: "stacking-cups", name: "Stacking cups", category: "toys" },
  { slug: "wooden-blocks", name: "Wooden blocks", category: "toys" },
  { slug: "shape-sorter", name: "Shape sorter", category: "toys" },
  { slug: "balls", name: "Balls (soft, various sizes)", category: "toys" },
  { slug: "push-toy", name: "Push toy / walker wagon", category: "toys" },
  { slug: "pull-toy", name: "Pull-along toy", category: "toys" },
  { slug: "toy-vehicles", name: "Toy cars / vehicles", category: "toys" },
  { slug: "stuffed-animals", name: "Stuffed animals / dolls", category: "toys" },
  { slug: "play-kitchen-food", name: "Play food / kitchen items", category: "toys" },
  { slug: "musical-shakers", name: "Shakers / maracas / tambourine", category: "music" },
  { slug: "toy-drum", name: "Toy drum or pots to bang", category: "music" },
  { slug: "board-books", name: "Board books", category: "books" },
  { slug: "touch-feel-books", name: "Touch-and-feel books", category: "books" },
  // art & sensory
  { slug: "crayons", name: "Chunky crayons", category: "art" },
  { slug: "paper", name: "Paper / cardboard", category: "art" },
  { slug: "finger-paint", name: "Finger paint (washable)", category: "art" },
  { slug: "playdough", name: "Play dough", category: "art" },
  { slug: "sensory-bin", name: "Bin for sensory play (rice/pasta/water)", category: "sensory" },
  { slug: "bubbles", name: "Bubbles", category: "sensory" },
  { slug: "water-table", name: "Water table / basin", category: "sensory" },
  // household
  { slug: "cardboard-boxes", name: "Cardboard boxes", category: "household" },
  { slug: "plastic-containers", name: "Plastic containers with lids", category: "household" },
  { slug: "measuring-cups", name: "Measuring cups / spoons", category: "household" },
  { slug: "wooden-spoons", name: "Wooden spoons", category: "household" },
  { slug: "muffin-tin", name: "Muffin tin", category: "household" },
  { slug: "laundry-basket", name: "Laundry basket", category: "household" },
  { slug: "scarves", name: "Scarves / fabric squares", category: "household" },
  { slug: "masking-tape", name: "Painter's / masking tape", category: "household" },
  { slug: "mirror", name: "Unbreakable mirror", category: "household" },
  { slug: "step-stool", name: "Toddler step stool", category: "household" },
  // gross motor
  { slug: "play-tunnel", name: "Play tunnel", category: "gross-motor" },
  { slug: "soft-climber", name: "Soft climbing blocks / couch cushions", category: "gross-motor" },
  { slug: "ride-on-toy", name: "Ride-on toy", category: "gross-motor" },
  { slug: "swing", name: "Toddler swing (outdoor)", category: "outdoor" },
  { slug: "sandbox", name: "Sandbox / sand toys", category: "outdoor" },
  { slug: "chalk", name: "Sidewalk chalk", category: "outdoor" },
];

for (const row of rows) {
  db.insert(materials).values(row).onConflictDoNothing().run();
}
console.log(`seed-materials done (${rows.length} materials ensured)`);
