/**
 * Nonfiction wonder seeds (2026-08-07): curated TRUE material for the
 * nonfiction shelf (how-it-works / animal-lives / big-ideas lanes). Same
 * contract as the myth seeds — bones are the actual facts, checked by a
 * parent in a PR, so the writer adapts curated truth instead of recalling
 * facts on its own. "Tradition" here is the discipline the facts come from.
 *
 * Rule for every entry: each sentence of bones must be genuinely true.
 * Simplify by omission, never by invention.
 */
import type { StorySeed } from "./types";

export const wonderSeeds: StorySeed[] = [
  {
    key: "computer-recipe",
    tradition: "computer science",
    title: "The Machine That Follows Recipes",
    bones:
      "A computer cannot think of anything on its own — it follows instructions, one at a time, exactly as written. People called programmers write those instructions, and a list of them is called a program, or code. Deep inside, a computer is made of billions of tiny switches, each one either on or off. Everything a computer knows — every picture, every song, every game — is stored as patterns of on and off. The switches flip billions of times every second, far too fast to see. When a computer seems clever, it is really following a very long recipe very, very fast. And somewhere, a person wrote every step.",
    keep: [
      "The recipe analogy — instructions followed exactly, one at a time, is the true heart of computing.",
      "On/off as the only alphabet: everything is patterns of two states.",
      "The awe of speed: billions of steps a second.",
      "People wrote the steps — a computer is a person's instructions running.",
    ],
    soften: [
      "No screens-are-bad framing and no scolding — this is a book about how a wonderful machine works.",
      "Make on/off physical and pointable: a light switch the child can flip is the same idea.",
      "A guide character may walk through the machine, but the machine is the star.",
    ],
    ageNotes:
      "Toddlers flip switches constantly — anchor the whole idea there. 'Program', 'code', and 'switch' are fine real words at any age.",
    tags: ["computers", "code", "machines", "how-it-works"],
  },
  {
    key: "octopus-day",
    tradition: "marine biology",
    title: "Three Hearts, Eight Arms",
    bones:
      "An octopus has three hearts, and its blood is blue. It has no bones at all, so it can pour itself through any gap bigger than its hard little beak. Its eight arms are covered in suckers, and the suckers can taste what they touch — an octopus tastes with its arms. Much of an octopus's thinking happens in the arms themselves, so an arm can explore a crack while the octopus looks somewhere else. It can change the color and even the texture of its skin in a moment, to match rocks or weed or sand. To move fast it squirts water backwards and jets away. It carries no shell, so it sometimes collects one — an octopus has been seen carrying coconut shells to hide in.",
    keep: [
      "Three hearts and blue blood — lead with the impossible-sounding truth.",
      "Tasting with arms; arms that partly think for themselves.",
      "The disappearing trick: color AND texture change.",
      "No bones — squeezing through anything bigger than its beak.",
    ],
    soften: [
      "The octopus hides because it is soft and careful, not because the sea is scary — no predators on the page.",
      "It never talks or wants human things; the wonder is watching a real animal be exactly itself.",
    ],
    ageNotes:
      "Every fact is pointable on the child's own body: count hearts, wiggle boneless arms, taste with a fingertip — the mismatch IS the delight.",
    tags: ["octopus", "ocean", "animals", "animal-lives"],
  },
  {
    key: "ant-city",
    tradition: "entomology",
    title: "The City Under the Path",
    bones:
      "Under an ordinary garden path there can be a whole city of ants — thousands of sisters living in rooms and tunnels they dug themselves. One large ant, the queen, lays all the eggs; the others are workers, and every worker has a job — some are nurses for the babies, some dig, some go out to find food. Ants talk with smells: a forager who finds something good lays down a scent trail, and the others follow it exactly, which is why ants walk in lines. An ant can lift many times its own weight, like a child lifting a car. Some ants even keep tiny herds of aphids, guarding them and milking them for sweet honeydew, the way farmers keep cows. When the path is quiet, the city underneath is still busy.",
    keep: [
      "The hidden-city reveal: the busiest place on the page is one the child has stood on.",
      "Smell-talk explaining the marching line the child has actually seen.",
      "Everyone has a job — nurses, diggers, foragers.",
      "Aphid-herding: real ants really farm.",
    ],
    soften: [
      "No squashing, no ant fights, no bird eating anyone — the city just works.",
      "Strength fact framed as marvel, not menace.",
    ],
    ageNotes:
      "Pairs perfectly with the look-closer form: path, then tunnel, then nursery. The child will check the next ant line they meet.",
    tags: ["ants", "insects", "animals", "animal-lives", "how-it-works"],
  },
  {
    key: "seed-travels",
    tradition: "botany",
    title: "How Seeds Go Traveling",
    bones:
      "A plant cannot walk, so it sends its children traveling instead. Maple seeds grow a single wing and spin down like tiny helicopters, drifting away from the tree. Dandelion seeds each carry a fluffy white parachute and ride the wind. Burdock seeds are covered in tiny hooks that grab onto animal fur — and onto socks — and hitch a ride; a man named George de Mestral studied those hooks under a magnifying lens and invented hook-and-loop fasteners because of them. Squirrels bury acorns to eat in winter and forget some, and a forgotten acorn can become an oak tree. Coconuts can float across the sea and sprout on a faraway beach. Every big tree once traveled as a small seed.",
    keep: [
      "One true travel trick per page: helicopter, parachute, hitchhiker, forgetful squirrel, floating coconut.",
      "The velcro origin story — a real person copying a seed's idea.",
      "The reversal ending: the giant tree was once the traveler.",
    ],
    soften: [
      "Keep de Mestral simply 'a curious person who looked closely' — no dates needed.",
      "The squirrel forgets happily; nobody goes hungry.",
    ],
    ageNotes:
      "Every mechanism is testable on a walk: throw a maple key, blow a dandelion, check socks after the meadow.",
    tags: ["seeds", "plants", "trees", "nature", "how-it-works"],
  },
  {
    key: "water-round",
    tradition: "earth science",
    title: "The Oldest Water in the World",
    bones:
      "The water in your cup has been traveling for longer than you can imagine. Warmth from the sun turns sea and puddle water into vapor — a gas too small to see — and it rises into the sky. High up where the air is cold, the vapor gathers into clouds, which are made of tiny floating water drops. When the drops grow heavy enough, they fall as rain. Rain runs into streams, streams into rivers, rivers back to the sea, and the journey starts again. The Earth almost never gets new water — the same water has gone around and around for billions of years. So the rain on your window may once have floated over the ocean, sat in a glacier, or splashed a dinosaur.",
    keep: [
      "The circle itself: sun lifts, cloud gathers, rain falls, river returns.",
      "Clouds are made of water drops — pointable out any window.",
      "The dinosaur-puddle ending: same water, unimaginably old.",
    ],
    soften: [
      "No floods, no storms as danger — rain is the sky returning what it borrowed.",
      "Say 'may once have' for the dinosaur beat — wonder, honestly framed.",
    ],
    ageNotes:
      "Bath steam is the whole first half of the cycle happening at arm's length — anchor there for the youngest band.",
    tags: ["water", "rain", "weather", "earth", "big-ideas"],
  },
  {
    key: "moon-changes",
    tradition: "astronomy",
    title: "The Moon Is Not Changing Shape",
    bones:
      "The moon seems to grow from a thin sliver to a full circle and shrink back, but the moon itself never changes shape at all. The moon makes no light of its own — moonlight is sunlight bouncing off its gray rock. The sun always lights one half of the moon, and as the moon slowly circles the Earth, about a month for one lap, we see that lit half from different sides — a sliver, a half, a whole face. It is the same moon for everyone: every person on Earth looks up at the very same moon you do. The moon has no wind and no rain, so the footprints of the astronauts who visited are still there, unchanged, and will stay for a very long time.",
    keep: [
      "The central correction told as a secret: it never changes — WE move around it.",
      "Moonlight is borrowed sunlight.",
      "Everyone's same moon — quietly enormous for a small child.",
      "The footprints that never blow away.",
    ],
    soften: [
      "The child's own window is the observatory; no rockets needed on the page.",
      "The month-long lap can just be 'slowly, slowly' — no numbers required.",
    ],
    ageNotes:
      "Pairs with a real ritual: check the moon tonight, again next week — the book keeps paying off for a month. Natural companion to the moon-festival seeds.",
    tags: ["moon", "sky", "space", "big-ideas"],
    festivalMonths: [9, 10],
  },
  {
    key: "bread-alive",
    tradition: "food science",
    title: "The Tiny Cooks in the Dough",
    bones:
      "Bread is fluffy because of billions of living helpers too small to see. Yeast is a real living thing — a tiny fungus — and one spoonful of it holds billions of them. Stirred into warm dough, the yeast eat the sugars in the flour and burp out little puffs of gas. The stretchy dough catches every burp as a bubble, so the dough slowly puffs up like a balloon — that is why it must sit quietly and rise. In the hot oven the bubbles are baked in place, and that is why bread is full of little holes. Some bakers keep a sourdough starter — a jar of living yeast — going for years and years, feeding it flour like a pet; some starters are older than the bakers themselves.",
    keep: [
      "Yeast is ALIVE — the whole astonishment in one word.",
      "The burp-bubble chain: eat, burp, catch, rise, bake — perfect cause-and-effect pages.",
      "Holes in the toast as fossil bubbles the child can point to at breakfast.",
      "The starter-as-pet, older than the baker.",
    ],
    soften: [
      "Burping is the technically true word and maximally funny at this age — use it without apology.",
      "Nothing dies in the oven on the page; the story ends at warm bread and found holes.",
    ],
    ageNotes:
      "Ends at the breakfast table: tomorrow's toast is the proof. Invisible-but-real is a big idea hiding in a small loaf.",
    tags: ["bread", "yeast", "food", "kitchen", "how-it-works"],
  },
  {
    key: "message-under-sea",
    tradition: "computer science",
    title: "How a Picture Crosses the Ocean",
    bones:
      "When you send a photo to someone far away, the computer first chops it into many tiny pieces, and each piece gets a label saying where it belongs. The pieces become flashes of light racing through threads of glass thinner than a hair, called fiber optic cables. Great bundles of these cables lie on the bottom of the ocean, laid there by special ships, crossing from one side of the sea to the other. The pieces of your picture do not have to travel together — they can take different paths and arrive in any order. At the far end, a computer reads the labels and puts every piece back in its place, and the whole picture appears. All of it — the chopping, the ocean crossing, the rebuilding — happens faster than one blink.",
    keep: [
      "Chop, label, race, rebuild — the true packet story is already a perfect picture-book structure.",
      "Light in glass threads under the actual ocean — fish swimming over your photo.",
      "Faster than a blink as the closing awe.",
    ],
    soften: [
      "The photo can be one the child just took of something homely — a dog, a grandparent's dumpling — so the machinery serves love.",
      "No broken-internet peril; every piece arrives.",
    ],
    ageNotes:
      "Grandparents-far-away is this family's real use case — the book quietly explains the video call to a-má. Strong fit for the look-closer form.",
    tags: ["internet", "computers", "ocean", "machines", "how-it-works"],
  },
];
