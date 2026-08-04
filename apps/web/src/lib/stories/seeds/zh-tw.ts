/**
 * Chinese & Taiwanese seeds — written with specificity, not "ancient China"
 * mush. Taiwanese Hokkien vs Mandarin is distinguished where it matters.
 * These back the "Chinese/Taiwanese culture" north star (share 0.2).
 */
import type { StorySeed } from "./types";

export const zhTwSeeds: StorySeed[] = [
  {
    key: "zodiac-race",
    tradition: "Chinese zodiac origin tale",
    title: "The Great Zodiac Race",
    bones:
      "The Jade Emperor announces a great race across a wide river: the first twelve animals to cross will each get a year named after them. Clever Rat and good-natured Cat plan to ride on Ox's broad back. Rat forgets to wake Cat (or, gentler: Cat oversleeps despite Rat's calling). Ox swims steadily with Rat perched between his horns; near the bank Rat leaps ashore first. Tiger arrives soaked, Rabbit hops across on stones and a floating log, Dragon is late because he stopped to bring rain to thirsty fields and to help Rabbit with a puff of wind. One by one the twelve arrive — steady Ox second, kind Dragon fifth, Pig last, happy anyway, having stopped for a snack and a nap. Each animal gets its year, and that is why the years take turns wearing animal names.",
    keep: [
      "the cumulative arrival structure — one animal per beat, perfect toddler engine",
      "each animal's arrival reflecting its character (steady, bouncy, kind, sleepy)",
      "Dragon being late BECAUSE of kindness",
      "the payoff: the years take turns wearing animal names",
    ],
    soften: [
      "use the Cat-oversleeps variant — no trickery or grudge needed at this age",
      "no one drowns, no one is pushed; Rat's leap is cheeky, not cruel",
      "twelve arrivals can compress to 5-6 named ones plus 'and more friends came'",
    ],
    ageNotes: "The race-and-arrivals shape works from 18mo; the full twelve suits 4+.",
    tags: ["chinese", "zodiac", "animals", "race", "culture"],
    vocab: [
      { word: "horse", romanization: "mǎ", gloss: "horse (Mandarin)", script: "馬" },
      { word: "rat", romanization: "lǎoshǔ", gloss: "rat (Mandarin)", script: "老鼠" },
    ],
    festivalMonths: [1, 2],
  },
  {
    key: "change-jade-rabbit",
    tradition: "Chinese Mid-Autumn Festival",
    title: "Chang'e and the Jade Rabbit",
    bones:
      "On the moon lives a gentle moon lady, Chang'e, with her companion the Jade Rabbit. The rabbit keeps busy with a little pestle and mortar, pounding soft moon-dust into shimmering medicine and moon-cakes' sweetness. On the night of the Mid-Autumn Festival the moon swells round and bright like a lantern. Down below, families carry glowing lanterns into the dark, set out round mooncakes, and share them under the full moon — one cake cut into pieces, one piece for everyone. Children look up and wave to the moon lady and her rabbit; if you look carefully at the full moon you can see the rabbit's long ears in the shadows. Chang'e and the rabbit look down at all the small warm lights and feel less far away.",
    keep: [
      "the moon lady and her rabbit as gentle nighttime company — someone kind is up there",
      "round things rhyme: full moon, mooncakes, lanterns, the family circle",
      "finding the rabbit's shape in the real moon — a thing the child can actually do",
    ],
    soften: [
      "skip the elixir backstory and Houyi entirely — Chang'e simply lives on the moon",
      "her distance is peaceful, not lonely-sad; the sharing below warms her",
    ],
    ageNotes: "Bedtime-adjacent but works as everyday-wonder too; lanterns and mooncakes are highly drawable.",
    tags: ["chinese", "mid-autumn", "moon", "festival", "family", "culture"],
    vocab: [
      { word: "moon", romanization: "yuèliang", gloss: "moon (Mandarin)", script: "月亮" },
      { word: "mooncake", romanization: "yuèbǐng", gloss: "mooncake (Mandarin)", script: "月餅" },
    ],
    festivalMonths: [9, 10],
  },
  {
    key: "nian-and-red",
    tradition: "Chinese Lunar New Year origin tale",
    title: "The Nian and the Color Red",
    bones:
      "Once a year, when winter turns, a big shaggy creature called the Nian comes down from the mountains to the village — and the Nian is grumpy and shy, and it simply cannot STAND two things: the color red and loud popping noises. The villagers discover this by accident: a child in a red coat, a dropped pot, a burst of firecrackers — and the Nian squeezes its eyes shut and hurries back up the mountain. So every year the village gets ready: red paper on every door, red envelopes with a coin inside for the children, red lanterns strung across the lanes, and firecrackers ready to pop-pop-pop. The family gathers for a big warm dinner while the Nian grumbles harmlessly far away, and the new year begins bright and red and loud and together.",
    keep: [
      "the joke that a big creature fears small bright things — power inverted, giggle-first",
      "the preparation sequence (red paper, red envelopes, lanterns, dinner) — a ritual the child can recognize",
      "pop-pop-pop as a join-in sound",
    ],
    soften: [
      "the Nian never threatens anyone — it is grumpy and easily startled, not dangerous",
      "let it keep a little dignity: maybe it secretly likes watching the lanterns from far away",
    ],
    ageNotes: "The funny-lane treatment works from 2yo; keeps Lunar New Year customs concrete.",
    tags: ["chinese", "lunar-new-year", "festival", "red", "family", "culture"],
    vocab: [
      { word: "red envelope", romanization: "hóngbāo", gloss: "red envelope (Mandarin)", script: "紅包" },
    ],
    festivalMonths: [1, 2],
  },
  {
    key: "magpie-bridge",
    tradition: "Chinese Qixi tale, gentled",
    title: "The Magpie Bridge",
    bones:
      "Two dear friends live on opposite banks of the wide, starry Silver River that runs across the night sky — one keeps gentle cows, one weaves cloth as soft as clouds. The river is too wide and too deep with stars to cross, so all year they wave to each other across the sparkling water. The magpies see this and hatch a plan: on one special summer night, every magpie in the world flies up at once and they line up wing to wing, tip to tail, until their backs make a bridge across the Silver River. The two friends run across the feather-bridge, meet in the middle, and spend the whole night trading stories and sharing snacks. When morning comes the magpies fly home very proud of themselves, and the friends wave until next year — because the magpies have already promised.",
    keep: [
      "the image of a bridge made of birds' backs — one of the great pictures in world folklore",
      "small helpers solving a big problem together",
      "the Milky Way as the Silver River — point at the real sky",
    ],
    soften: [
      "lovers separated by decree becomes two friends who live far apart — no punishment backstory",
      "the yearly meeting is a happy tradition, not a tragedy; the waiting is cozy anticipation",
    ],
    ageNotes: "Friendship-across-distance resonates once the child knows people who live far away (grandparents).",
    tags: ["chinese", "qixi", "stars", "friendship", "birds", "culture"],
    festivalMonths: [8],
  },
  {
    key: "sun-moon-lake-deer",
    tradition: "Thao legend, Taiwan",
    title: "The White Deer of Sun Moon Lake",
    bones:
      "Long ago, Thao hunters in the mountains of Taiwan glimpsed a rare white deer slipping between the trees. They followed it — not to catch it, but because it was beautiful and it seemed to want to be followed — for days, over ridges and through bamboo, until the deer stopped at the edge of a lake the hunters had never seen: vast, still, and blue-green, with one round half like the sun and one curved half like the moon, and a small island resting in the middle. The white deer looked back once, then vanished into the forest. The hunters brought their families to live by the shining water, and the lake is still there today — Sun Moon Lake — with its little island, and people still tell of the deer that led the way.",
    keep: [
      "the follow-the-animal quest shape — out and out and out, then a reveal",
      "the lake's real geography: sun-round half, moon-curve half, the small island",
      "this is a TAIWANESE indigenous (Thao) story — name the people with respect",
    ],
    soften: [
      "the hunt becomes a following; no arrows, no catching",
      "the deer is mysterious but benevolent — a guide, not a spirit to fear",
    ],
    ageNotes: "A little-quest natural; lands best 2.5yo+ when 'discovering a place' registers.",
    tags: ["taiwanese", "thao", "deer", "lake", "taiwan", "quest", "culture"],
  },
  {
    key: "formosan-bear-v",
    tradition: "Taiwan — pourquoi tale about the endemic Formosan black bear",
    title: "Why the Formosan Black Bear Wears a White V",
    bones:
      "The Formosan black bear — Taiwan's own bear, big and shaggy and shy — has a bright white V on its chest, like a crescent moon worn as a necklace. Why? Here is one telling: long ago the bear helped the moon. The moon had slipped low one night and snagged in the tall mountain cedars, and the more it wriggled the more stuck it got. The big gentle bear climbed the tallest tree, hugged the moon carefully — SO carefully — and lifted it free into the sky. Where the moon rested against the bear's chest, it left a glowing crescent of moonlight in his fur that never washed off. Now every Formosan black bear wears the moon's thank-you, and on bright nights the moon still leans down to shine hello.",
    keep: [
      "the real animal: Formosan black bear, Taiwan's endemic bear, white V/crescent on the chest",
      "the pourquoi payoff the child can verify in any photo of the bear",
      "gentleness at scale — the biggest animal doing the most careful thing",
    ],
    soften: ["nothing needs softening — invented tale; keep the bear unhurried and huggable"],
    ageNotes: "Pure pourquoi-lane material; the hug beat is 18mo-friendly.",
    tags: ["taiwanese", "bear", "moon", "pourquoi", "animals", "taiwan", "culture"],
  },
  {
    key: "night-market",
    tradition: "Taiwan — texture seed, not a myth",
    title: "Night Market Evening",
    bones:
      "When the sky goes purple, the night market wakes up: strings of lights blink on, steam rises from a hundred pots, and the lane fills with sounds — vendors calling, oil sizzling, a bell somewhere. A gua bao stall pillows soft white buns around warm filling. The bubble tea stand shakes cups with a chk-chk-chk (and bubble tea was invented right here in Taiwan — a playful bit of history). There are wheel cakes turning golden in their molds, stinky tofu that makes grown-ups grin and children wrinkle their noses, and a lantern seller at the end of the lane. A small child rides on a-má's hip through all of it, holding one warm paper bag, watching everything.",
    keep: [
      "sensory density: steam, lights, sizzle, calls — a feast for naming and pointing",
      "gua bao, bubble tea (Taiwanese invention!), wheel cakes — real, specific foods",
      "the safe warm vantage of a grandparent's hip",
    ],
    soften: ["crowds render as warmth and lights, not crush; keep the scenes simple for the art pipeline"],
    ageNotes: "Texture for everyday-wonder or bedtime lanes; counts as culture-touched without any lesson.",
    tags: ["taiwanese", "night-market", "food", "family", "taiwan", "culture"],
    vocab: [
      { word: "grandma", romanization: "a-má", gloss: "grandma (Taiwanese Hokkien)", script: "阿媽" },
      { word: "bubble tea", romanization: "zhēnzhū nǎichá", gloss: "bubble tea (Mandarin)", script: "珍珠奶茶" },
    ],
  },
  {
    key: "tang-yuan-solstice",
    tradition: "Chinese/Taiwanese winter solstice custom",
    title: "Tang-yuan at Winter Solstice",
    bones:
      "On the shortest day of the year, when the dark comes early and the kitchen windows glow, the whole family makes tang-yuan: soft round dumplings of glutinous rice flour rolled between small palms and big palms alike. Some are white and some are pink; the littlest ones are lumpy because the littlest hands made them, and those are declared the best ones. The round balls bob in a sweet warm soup like little full moons. Everyone eats a bowl, and eating the round dumplings together means the family circle is round and whole — and there's a saying that once you've had your winter-solstice tang-yuan you are one year older, which the child finds extremely interesting.",
    keep: [
      "rolling the dough — a thing the child's own hands do; lumpy ones are the best ones",
      "roundness as togetherness: dumplings, bowls, the family circle",
      "the one-year-older saying as a delighted punchline",
    ],
    soften: ["nothing to soften — keep it small, warm, and steamy"],
    ageNotes: "Everyday-wonder/bedtime texture; pairs naturally with a first-snow or early-dark setting.",
    tags: ["taiwanese", "chinese", "winter-solstice", "food", "family", "culture"],
    vocab: [
      { word: "sweet dumpling", romanization: "tang-yuan", gloss: "sweet rice dumpling (Mandarin: tāngyuán)", script: "湯圓" },
    ],
    festivalMonths: [12],
  },
  {
    key: "monkey-king-play",
    tradition: "Chinese — Journey to the West, gentled to play",
    title: "Monkey King Mini-Episodes",
    bones:
      "Sun Wukong, the Monkey King, is the best player of games in the whole world. He can somersault from cloud to cloud — one flip carries him a hundred li, whee! He can pluck a hair from his fur, blow on it, and poof: a dozen tiny monkeys to play hide-and-seek with. He can shrink his magic staff to a needle and tuck it behind his ear, or stretch it long enough to be a bridge over a stream. Each mini-episode is one game: cloud-somersault tag with a crane, shape-changing guess-who with a fish (is that rock a monkey? is that beetle?), helping small animals cross water with the staff-bridge. He is cheeky, generous, and always a little too pleased with himself — and the games always end with everyone flopped in a giggling heap.",
    keep: [
      "the three iconic powers: cloud somersault, hair-clones, the growing/shrinking staff",
      "episodic game structure — each power is one playable beat",
      "his cheeky pride played for giggles",
    ],
    soften: [
      "no demons, no punishments, no journey peril — just powers used for play and small kindnesses",
      "his mischief lands on himself (overshoots his somersault), never hurts others",
    ],
    ageNotes: "Funny-lane and little-quest material; the somersault WHEE is a join-in beat from 18mo.",
    tags: ["chinese", "monkey-king", "play", "magic", "funny", "culture"],
    vocab: [
      { word: "monkey", romanization: "hóuzi", gloss: "monkey (Mandarin)", script: "猴子" },
    ],
  },
  {
    key: "family-words",
    tradition: "Taiwanese Hokkien & Mandarin — vocabulary seed",
    title: "Family Words",
    bones:
      "Not a tale — a pocket of family words that can ride any story as stretch words. In Taiwanese Hokkien, grandma is a-má and grandpa is a-kong — the warm everyday words Taiwanese kids call across the kitchen. In Mandarin, mama is māma and papa is bàba; the moon is yuèliang; thank you is xièxie. One or two of these, tucked where context makes them obvious (someone calls 'A-má!' from the doorway; the moon rises and someone whispers 'yuèliang'), let a book sound like this family without a single translation footnote.",
    keep: [
      "a-má / a-kong are HOKKIEN — the Taiwanese family register; don't swap in Mandarin nǎinai/yéye",
      "context-gloss placement: the word's meaning must be obvious from the scene",
    ],
    soften: ["use 1-2 words maximum per book; never a vocabulary list on the page"],
    ageNotes: "Any age; sound-words like xièxie land earliest.",
    tags: ["taiwanese", "hokkien", "mandarin", "family", "words", "culture"],
    vocab: [
      { word: "grandma", romanization: "a-má", gloss: "grandma (Taiwanese Hokkien)", script: "阿媽" },
      { word: "grandpa", romanization: "a-kong", gloss: "grandpa (Taiwanese Hokkien)", script: "阿公" },
      { word: "mama", romanization: "māma", gloss: "mama (Mandarin)", script: "媽媽" },
      { word: "papa", romanization: "bàba", gloss: "papa (Mandarin)", script: "爸爸" },
      { word: "moon", romanization: "yuèliang", gloss: "moon (Mandarin)", script: "月亮" },
      { word: "thank you", romanization: "xièxie", gloss: "thank you (Mandarin)", script: "謝謝" },
    ],
  },
];
