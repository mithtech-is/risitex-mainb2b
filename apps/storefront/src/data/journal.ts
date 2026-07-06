export type JournalPost = {
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  category: "Craft" | "Stories" | "Care" | "Mills";
  author: string;
  publishedAt: string;
  readMinutes: number;
  imageTone: string;
};

export const JOURNAL_POSTS: JournalPost[] = [
  {
    slug: "the-poplin-guide",
    title: "What we mean when we say poplin.",
    excerpt:
      "Yarn count, weave, finish. A short field guide to the most over-used word in shirting.",
    body: [
      "Poplin is a weave, not a fabric. Specifically, a tight plain weave with a thinner warp and a heavier weft. The result is a smooth, crisp surface that handles ironing well and holds its shape through wash after wash.",
      "Most poplin you'll buy in India is 40s to 60s yarn count. Ours is 60s — woven on dobby looms in our Bangalore mill. Higher than 60s reads like silk but pills faster; lower than 40s feels like canvas. 60s is the sweet spot.",
      "The mercerised finish is what gives the cotton a faint sheen and the dye that extra punch. Without mercerisation, indigo poplin would look washed out at the first laundering. With it, the colour stays through a thousand cycles.",
    ],
    category: "Craft",
    author: "Manoj K.",
    publishedAt: "2026-05-12",
    readMinutes: 5,
    imageTone: "#F1ECDF",
  },
  {
    slug: "inside-bangalore",
    title: "Inside Bangalore — a day in the dyehouse.",
    excerpt:
      "Five in the morning, the boilers come on. By eight, the indigo vat is ready. A photo essay.",
    body: [
      "The dyehouse runs on a different clock. Indigo wants time and temperature, not rushing.",
      "We document a single Wednesday — boiler ignition at 5:12 am, first vat ready at 7:48, first batch off the loom and into the wash at 11:30, line-drying from one in the afternoon onward.",
      "Why care? Because if you've ever wondered why an indigo from one season fades differently to another, this is the answer. Same recipe; weather and water do the rest.",
    ],
    category: "Mills",
    author: "Priya R.",
    publishedAt: "2026-04-22",
    readMinutes: 7,
    imageTone: "#DCE3F0",
  },
  {
    slug: "wash-wear-repeat",
    title: "Wash, wear, repeat.",
    excerpt: "A practical guide to making the cloth last.",
    body: [
      "Cold water. No dryer. Iron warm, not hot. That's most of it.",
      "Pre-shrunk cotton is meant to be washed often. Don't dry-clean it — the chemicals strip the natural oils that give the fabric its hand.",
      "Stains: tackle them within an hour with cold water and white vinegar. If you have to use detergent, use the kind without optical brighteners.",
    ],
    category: "Care",
    author: "Customer care",
    publishedAt: "2026-03-08",
    readMinutes: 3,
    imageTone: "#E8E3D2",
  },
];

export function getJournalPost(slug: string): JournalPost | undefined {
  return JOURNAL_POSTS.find((p) => p.slug === slug);
}
