import { isIconId, type IconId } from "@/lib/icons";

/** Working out which little drawing, if any, a line has earned.
 *
 *  The governing rule is restraint. An icon on every line is wallpaper —
 *  you stop seeing it, and the page stops looking like paper. An icon on
 *  one line in four is a landmark you can find from across the room, which
 *  is the entire point of the feature. So the dictionary below only holds
 *  words that name a *thing you do*, never adjectives, verbs of intent
 *  ("finish", "start", "try"), or anything whose icon would be a guess.
 *
 *  When it has no idea it draws nothing, and that is the correct answer
 *  far more often than it is a failure. */

/** word (or phrase) → icon. Phrases are matched before single words, so
 *  "walk the dog" beats "walk". */
const DICTIONARY: Record<string, IconId> = {
  // moving the body
  gym: "dumbbell",
  workout: "dumbbell",
  lift: "dumbbell",
  weights: "dumbbell",
  training: "dumbbell",
  train: "dumbbell",
  exercise: "dumbbell",
  run: "run",
  running: "run",
  jog: "run",
  jogging: "run",
  "5k": "run",
  "10k": "run",
  marathon: "run",
  bike: "bike",
  cycle: "bike",
  cycling: "bike",
  ride: "bike",
  swim: "swim",
  swimming: "swim",
  pool: "swim",
  walk: "walk",
  walking: "walk",
  steps: "walk",
  hike: "walk",
  hiking: "walk",
  football: "ball",
  soccer: "ball",
  basketball: "ball",
  match: "ball",
  tennis: "racket",
  padel: "racket",
  squash: "racket",
  badminton: "racket",

  // keeping clean
  shower: "shower",
  bath: "shower",
  wash: "shower",
  shave: "razor",
  shaving: "razor",
  beard: "razor",
  teeth: "tooth",
  dentist: "tooth",
  floss: "tooth",
  haircut: "scissors",
  barber: "scissors",
  nails: "scissors",

  // eating
  lunch: "meal",
  dinner: "meal",
  breakfast: "meal",
  eat: "meal",
  cook: "meal",
  cooking: "meal",
  meal: "meal",
  "meal prep": "meal",
  restaurant: "meal",
  coffee: "coffee",
  tea: "coffee",
  cafe: "coffee",
  espresso: "coffee",
  groceries: "groceries",
  grocery: "groceries",
  shopping: "groceries",
  supermarket: "groceries",
  shop: "groceries",
  water: "water",
  hydrate: "water",

  // the head
  read: "book",
  reading: "book",
  book: "book",
  chapter: "book",
  study: "study",
  studying: "study",
  revise: "study",
  revision: "study",
  exam: "study",
  lecture: "study",
  class: "study",
  uni: "study",
  university: "study",
  homework: "study",
  course: "study",
  write: "pen",
  writing: "pen",
  essay: "pen",
  draft: "pen",
  notes: "pen",
  code: "laptop",
  coding: "laptop",
  laptop: "laptop",
  programming: "laptop",
  work: "work",
  office: "work",
  shift: "work",
  meeting: "people",
  interview: "people",

  // admin
  email: "mail",
  mail: "mail",
  inbox: "mail",
  reply: "mail",
  call: "call",
  phone: "call",
  ring: "call",
  pay: "money",
  bill: "money",
  bills: "money",
  rent: "money",
  invoice: "money",
  bank: "money",
  budget: "money",
  salary: "money",
  tax: "document",
  taxes: "document",
  form: "document",
  forms: "document",
  cv: "document",
  contract: "document",
  application: "document",
  passport: "document",
  insurance: "document",

  // the body, repaired
  medicine: "pill",
  meds: "pill",
  pills: "pill",
  vitamins: "pill",
  pharmacy: "pill",
  prescription: "pill",
  doctor: "health",
  gp: "health",
  hospital: "health",
  therapy: "health",
  appointment: "health",
  checkup: "health",

  // the house
  clean: "clean",
  cleaning: "clean",
  tidy: "clean",
  hoover: "clean",
  vacuum: "clean",
  dishes: "clean",
  laundry: "laundry",
  washing: "laundry",
  ironing: "laundry",
  iron: "laundry",
  clothes: "laundry",
  bins: "bins",
  bin: "bins",
  rubbish: "bins",
  trash: "bins",
  recycling: "bins",
  garbage: "bins",
  fix: "fix",
  repair: "fix",
  diy: "fix",
  assemble: "fix",
  plants: "plant",
  plant: "plant",
  garden: "plant",
  watering: "plant",
  home: "home",
  house: "home",
  flat: "home",
  move: "home",

  // going places
  car: "car",
  drive: "car",
  driving: "car",
  petrol: "car",
  mot: "car",
  parking: "car",
  taxi: "car",
  flight: "flight",
  fly: "flight",
  airport: "flight",
  plane: "flight",
  trip: "flight",
  holiday: "flight",
  travel: "flight",
  bus: "train",
  station: "train",

  // other people
  meet: "people",
  friends: "people",
  family: "people",
  visit: "people",
  party: "people",
  date: "people",
  dinner_with: "people",
  birthday: "cake",
  gift: "gift",
  present: "gift",
  card: "gift",

  // time off
  music: "music",
  guitar: "music",
  piano: "music",
  playlist: "music",
  practice: "music",
  film: "film",
  movie: "film",
  cinema: "film",
  series: "film",
  watch: "film",
  episode: "film",
  game: "game",
  gaming: "game",
  games: "game",
  xbox: "game",
  playstation: "game",
  dog: "pet",
  cat: "pet",
  vet: "pet",
  "walk the dog": "pet",
  sleep: "sleep",
  nap: "sleep",
  bed: "sleep",
  rest: "sleep",
  photo: "photo",
  photos: "photo",
  camera: "photo",

  // the catch-alls
  keys: "key",
  key: "key",
};

/** Words that must never carry an icon on their own, even if a learned
 *  mapping would let them — they turn up in half the lines in the book. */
const NEVER_LEARN = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "with",
  "from",
  "by",
  "my",
  "me",
  "i",
  "it",
  "this",
  "that",
  "is",
  "be",
  "do",
  "go",
  "get",
  "got",
  "need",
  "needs",
  "have",
  "has",
  "make",
  "made",
  "take",
  "takes",
  "today",
  "tomorrow",
  "tonight",
  "morning",
  "evening",
  "then",
  "new",
  "some",
  "more",
  "all",
  "up",
  "out",
  "off",
  "not",
  "no",
  "yes",
  "ok",
  "about",
  "again",
  "back",
  "now",
  "soon",
  "later",
  "day",
  "week",
  "month",
  "year",
  "time",
  "finish",
  "start",
  "try",
  "check",
]);

/** The mapping this device has been taught, word → icon, or word → null
 *  for "stop guessing at this word". */
export type Learned = Record<string, IconId | null>;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Phrases first, longest first, so "walk the dog" beats "walk". */
const PHRASES = Object.keys(DICTIONARY)
  .filter((k) => k.includes(" "))
  .sort((a, b) => b.length - a.length);

/**
 * The icon a line has earned, or null for the common case of none.
 *
 * What this device has been taught always wins, including being taught to
 * draw nothing — otherwise correcting a wrong guess would be impossible.
 */
export function iconFor(text: string, learned: Learned = {}): IconId | null {
  const clean = text.toLowerCase();
  const list = words(text);
  if (list.length === 0) return null;

  // a taught phrase or word beats everything, in the order it would read
  for (const word of list) {
    if (word in learned) return learned[word];
  }

  for (const phrase of PHRASES) {
    if (clean.includes(phrase)) return DICTIONARY[phrase];
  }

  // The most specific word wins, not the first one. "book flights" is a
  // flight, not a book; "pay the rent" is rent. Length is a crude proxy for
  // specificity but it is the right one often enough, and first-word-wins
  // was wrong in a way people notice immediately. Ties keep the earlier
  // word, so the rule stays stable as a line is edited.
  let best: IconId | null = null;
  let bestLength = 0;
  for (const word of list) {
    const hit = lookUp(word);
    if (hit && word.length > bestLength) {
      best = hit;
      bestLength = word.length;
    }
  }
  return best;
}

/** A plain plural is the same word. Only tried when the word itself misses,
 *  so "bus" and "dishes" are unaffected — this exists because "flights"
 *  silently missing while "flight" matched is the sort of hole nobody finds
 *  until the icon they expected isn't there. */
function lookUp(word: string): IconId | undefined {
  return (
    DICTIONARY[word] ??
    (word.endsWith("s") ? DICTIONARY[word.slice(0, -1)] : undefined)
  );
}

/**
 * Which word a manual choice should be remembered against.
 *
 * The longest word that isn't furniture: in "book the padel court" that is
 * "padel", which is the word that actually makes the line what it is. The
 * app says out loud which word it picked, because a rule you can't see is
 * one you can't correct.
 */
export function wordToLearn(text: string): string | null {
  const candidates = words(text).filter(
    (w) => w.length > 2 && !NEVER_LEARN.has(w),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, w) => (w.length > best.length ? w : best));
}

/** Guard what comes back off the wire or out of storage. */
export function cleanLearned(raw: unknown): Learned {
  if (!raw || typeof raw !== "object") return {};
  const out: Learned = {};
  for (const [word, icon] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof word !== "string" || word.length === 0) continue;
    if (icon === null) out[word] = null;
    else if (typeof icon === "string" && isIconId(icon)) out[word] = icon;
  }
  return out;
}
