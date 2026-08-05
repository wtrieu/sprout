/**
 * World myths & fables — Aesop, Norse, Greek, gentled. Contrast material so
 * the culture emphasis has something to be weighed against.
 */
import type { StorySeed } from "./types";

export const worldMythSeeds: StorySeed[] = [
  {
    key: "north-wind-and-sun",
    tradition: "Aesop",
    title: "The North Wind and the Sun",
    bones:
      "The North Wind and the Sun fall into a friendly argument about who is stronger, and they pick the gentlest possible contest: a traveler is walking the road below in a big coat — whoever can get the coat off wins. The Wind goes first: it huffs and puffs and BLOWS, and the harder it blows the tighter the traveler wraps the coat, until the Wind runs out of breath entirely. Then the Sun simply comes out from behind a cloud and shines, warm and steady. The traveler smiles, slows down, unbuttons the coat, and finally takes it off to rest in the warm grass. The Wind harrumphs; the Sun twinkles; the traveler has a nice nap.",
    keep: [
      "the blowing beats as join-in sound play (whooo, WHOOO)",
      "warmth winning without a word — the lesson stays entirely in the action",
      "the Wind as a good sport, grumbling but not mean",
    ],
    soften: ["the contest is friendly from the start; the traveler is never distressed, just windblown"],
    ageNotes: "The blow-vs-shine contrast reads from 18mo; folk-tale or funny lane.",
    tags: ["aesop", "wind", "sun", "weather", "fable"],
  },
  {
    key: "lion-and-mouse",
    tradition: "Aesop",
    title: "The Lion and the Mouse",
    bones:
      "A tiny mouse accidentally scampers across a sleeping lion's paw. The lion wakes, lifts the mouse by the tail, and considers being grumpy about it — but the mouse squeaks that someday, maybe, a mouse could help a lion, and the lion is so tickled by the idea that he lets the mouse go with a chuckle. Days later the lion gets tangled — in a hunter's net in the old telling, or in thick thorny vines in the gentled one — and roars a stuck, embarrassed roar. The mouse hears, comes running, and gnaws through the ropes strand by strand, nibble nibble nibble, until the lion steps free. The lion bows his great head to the smallest of friends.",
    keep: [
      "the size inversion — smallest helper, biggest rescue",
      "nibble-nibble-nibble as a repeatable working sound",
      "the lion's courtesy at the end — gratitude without a moral speech",
    ],
    soften: ["use vines/branches instead of a hunter's net; the lion is stuck and sheepish, not in danger"],
    ageNotes: "Classic shape for 2yo+; quiet enough for bedtime-adjacent use.",
    tags: ["aesop", "lion", "mouse", "kindness", "animals", "fable"],
  },
  {
    key: "tortoise-and-hare",
    tradition: "Aesop",
    title: "The Tortoise and the Hare",
    bones:
      "The hare is fast and knows it; the tortoise is slow and doesn't mind. When the hare teases, the tortoise proposes a race, and all the animals come to watch. The hare zooms off in a cloud of dust — so far ahead that he stops to snack on clover, then to admire himself in a pond, then for just a tiny nap in the warm sun. The tortoise keeps walking: step, step, step, past the snacking, past the pond, past the snoring hare. The hare wakes to cheering, sprints his fastest sprint, and arrives one step too late. The tortoise offers him a bite of the winner's lettuce, and they walk the course back together, slowly.",
    keep: [
      "step, step, step — the tortoise's rhythm is the book's rhythm",
      "the hare's detours as an escalating comedy of confidence",
      "the shared lettuce ending — victory without gloating",
    ],
    soften: ["the hare is silly, not humiliated; friendship restored on the last page"],
    ageNotes: "Race structure with a repeated walking beat; 2yo+.",
    tags: ["aesop", "tortoise", "hare", "race", "animals", "fable"],
  },
  {
    key: "why-the-sea-is-salty",
    tradition: "Norse folk tale",
    title: "Why the Sea Is Salty",
    bones:
      "There is a magic mill — a small stone hand-mill — that grinds out whatever it is asked for: porridge, herring, firewood, gold buttons — and keeps grinding until someone says the special words to stop it. It grinds a poor brother's cottage full of good things (and rather too full of porridge at one point). Eventually a sea captain hears of it and borrows the mill for his ship, asks it to grind salt — sailors always need salt — and sails off without ever learning the stopping words. The mill grinds salt, and more salt, and MORE salt, until the ship rides low and the captain tips the whole business overboard. At the bottom of the sea the little mill is grinding still, which is why the sea is salty — taste it and see.",
    keep: [
      "the runaway-machine comedy: grind, grind, grind piling ever higher",
      "the pourquoi payoff the child can verify with one lick of sea water",
      "the stopping-words gag — magic with an instruction manual nobody reads",
    ],
    soften: ["the ship settles low and everyone paddles cheerfully ashore; nobody drowns; losing the mill is a relief"],
    ageNotes: "Pourquoi or funny lane; the escalation reads from 2yo.",
    tags: ["norse", "sea", "salt", "magic", "pourquoi", "folk-tale"],
  },
  {
    key: "arion-and-the-dolphin",
    tradition: "Greek legend, gentled",
    title: "Arion and the Dolphin",
    bones:
      "Arion is a musician whose lyre-songs are so lovely that gulls hang in the air to listen. Sailing home across the sea, he plays his songs on deck at dusk — and the music pours over the water, and a dolphin rises to listen, circling the ship, leaping when the song leaps. When the sea turns rough (gentled: a storm splashes Arion overboard, or he leans too far into his song), the dolphin is there in a heartbeat, sliding beneath him, lifting him on its smooth grey back. All the way home the dolphin carries the musician over the moonlit water, and Arion plays as they go — a concert for one dolphin, the best audience he ever had. At the shore he thanks his friend, and ever after plays his first song of every evening facing the sea.",
    keep: [
      "music as the bridge between species — the dolphin comes for the SONG",
      "the ride home across moonlit water — a serene, drawable centerpiece",
      "the evening thank-you ritual at the end",
    ],
    soften: ["remove the greedy sailors entirely; the fall is accidental and brief, the rescue immediate"],
    ageNotes: "Myth-retelling lane; gentle enough to shade into bedtime.",
    tags: ["greek", "dolphin", "music", "sea", "myth"],
  },
  {
    key: "crow-and-the-pitcher",
    tradition: "Aesop",
    title: "The Crow and the Pitcher",
    bones:
      "A thirsty crow finds a tall pitcher with water at the very bottom — too low for her beak, too heavy to tip, too narrow to climb into. She thinks. Then she picks up a pebble and drops it in: plink. The water rises the tiniest bit. Another pebble: plink. Another and another — plink, plink, plink — and with every pebble the water climbs, until at last it stands at the brim and the crow drinks her fill. She caws a satisfied caw and keeps one last pebble as a souvenir.",
    keep: [
      "plink — the repeated pebble-drop is the whole engine, countable and joinable",
      "visible cause and effect: each pebble raises the water a little",
      "the crow solving it herself, unhurried",
    ],
    soften: ["her thirst is mild motivation, not distress; the mood is puzzle, not peril"],
    ageNotes: "The most toddler-mechanical of the fables — 18mo+ love the plink count.",
    tags: ["aesop", "crow", "puzzle", "water", "fable"],
  },
];
