/**
 * Prompt moderation gate (spec §5: "can't be used unethically").
 *
 * Runs before any generation. Deterministic, offline, no API key — same
 * constraint as the rest of the Mini path, so the free tier stays free and the
 * gate can't be disabled by a missing env var.
 *
 * DESIGN BIAS: high precision over high recall. This is the prompt box of a
 * motion-design tool, where "killer app", "explosive growth", "shoot the hero
 * shot" and "drug discovery startup" are all ordinary copy. A false positive
 * blocks legitimate paid work and is far more likely than a true positive, so
 * every rule here is either an unambiguous term or a co-occurrence of two term
 * classes. Single ambiguous words never block on their own.
 *
 * At M7 a real classifier runs in front of the paid tiers (there is already an
 * LLM in that request path). This stays as the cheap always-on floor beneath it.
 */

export type ModerationCategory =
  | "csae"
  | "sexual"
  | "violence"
  | "weapons"
  | "hate"
  | "fraud"
  | "malware";

export interface ModerationResult {
  ok: boolean;
  category?: ModerationCategory;
  /** Short, non-quoting reason. Safe to log; never echoes the prompt back. */
  reason?: string;
}

const OK: ModerationResult = { ok: true };

/** Build a word-boundary alternation. Terms may contain spaces. */
function words(...terms: string[]): RegExp {
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "i");
}

// --- term classes ----------------------------------------------------------

const MINOR = words(
  "child", "children", "kid", "kids", "toddler", "infant", "baby", "babies",
  "minor", "minors", "underage", "preteen", "pre-teen", "teen", "teens",
  "teenager", "teenagers", "schoolgirl", "schoolboy", "boy", "girl",
  "little boy", "little girl", "8 year old", "12 year old", "13 year old",
);

const SEXUAL = words(
  "nude", "nudes", "naked", "topless", "porn", "porno", "pornographic",
  "sex", "sexual", "sexy", "erotic", "erotica", "explicit", "nsfw", "xxx",
  "fetish", "lingerie", "undressing", "stripping", "orgasm", "genitals",
  "breasts", "nipples",
);

/** Unambiguous on its own — no legitimate motion-design reading. */
const CSAE_EXPLICIT = words("cp", "csam", "child porn", "childporn", "loli", "lolicon", "shota");

const VIOLENCE_ACT = words(
  "kill", "killing", "murder", "behead", "beheading", "execute", "execution",
  "torture", "lynch", "massacre", "shoot", "shooting", "stab", "stabbing",
  "assassinate", "assassination", "bomb", "bombing",
);

/** Real, identifiable targets — what turns depiction into a threat. */
const REAL_TARGET = words(
  "my neighbour", "my neighbor", "my boss", "my teacher", "my ex",
  "my coworker", "my co-worker", "my classmate", "my wife", "my husband",
  "the president", "the prime minister", "a politician", "this person",
);

const THREAT_FRAME = words(
  "threat", "threaten", "threatening", "revenge on", "get back at",
  "hit list", "kill list",
);

const WEAPONS_MAKE = words(
  "how to make", "how to build", "how to construct", "instructions for",
  "recipe for", "step by step", "tutorial for", "blueprint for", "schematic for",
);

const WEAPONS_ITEM = words(
  "pipe bomb", "ied", "improvised explosive", "pressure cooker bomb",
  "molotov", "napalm", "thermite", "nerve agent", "sarin", "ricin",
  "anthrax", "dirty bomb", "explosive device", "silencer", "suppressor",
  "ghost gun", "untraceable gun", "auto sear", "3d printed gun",
);

const HATE_SLUR = words(
  "nigger", "nigga", "faggot", "fag", "kike", "spic", "chink", "gook",
  "wetback", "tranny", "raghead", "towelhead", "coon",
);

const HATE_FRAME = words(
  "genocide", "ethnic cleansing", "gas the", "white power", "heil hitler",
  "sieg heil", "holocaust denial", "great replacement",
);

const HATE_GROUP = words(
  "jews", "muslims", "blacks", "asians", "immigrants", "gays", "lesbians",
  "trans people", "transgender people", "mexicans", "arabs",
);

const HATE_ACTION = words(
  "should die", "should be killed", "deserve to die", "must be removed",
  "are subhuman", "are vermin", "are parasites", "exterminate", "eradicate",
);

const FRAUD_ARTIFACT = words(
  "bank statement", "pay stub", "paystub", "payslip", "invoice", "receipt",
  "passport", "drivers license", "driver's license", "id card", "diploma",
  "certificate", "utility bill", "tax return", "w-2", "proof of address",
  "login page", "sign-in page", "signin page", "verification code",
  "credit card", "kyc document",
);

const FRAUD_FRAME = words(
  "fake", "forged", "forge", "counterfeit", "phishing", "phish", "scam",
  "spoof", "spoofed", "clone of", "impersonate", "impersonating",
  "indistinguishable from", "pass as real", "looks official", "bypass verification",
);

const MALWARE = words(
  "ransomware", "keylogger", "key logger", "rootkit", "botnet", "trojan",
  "spyware", "credential stealer", "infostealer", "ddos", "sql injection",
  "exploit kit", "reverse shell", "backdoor",
);

// --- rules -----------------------------------------------------------------

interface Rule {
  category: ModerationCategory;
  reason: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  {
    category: "csae",
    reason: "Requests involving the sexualisation of minors are not permitted.",
    test: (p) => CSAE_EXPLICIT.test(p) || (MINOR.test(p) && SEXUAL.test(p)),
  },
  {
    category: "hate",
    reason: "Requests containing slurs or dehumanising content are not permitted.",
    test: (p) =>
      HATE_SLUR.test(p) ||
      HATE_FRAME.test(p) ||
      (HATE_GROUP.test(p) && HATE_ACTION.test(p)),
  },
  {
    category: "violence",
    reason: "Requests depicting or threatening violence against real people are not permitted.",
    test: (p) =>
      (VIOLENCE_ACT.test(p) && REAL_TARGET.test(p)) ||
      (THREAT_FRAME.test(p) && VIOLENCE_ACT.test(p)),
  },
  {
    category: "weapons",
    reason: "Requests for weapons or explosives fabrication are not permitted.",
    test: (p) => WEAPONS_ITEM.test(p) && WEAPONS_MAKE.test(p),
  },
  {
    category: "fraud",
    reason: "Requests to produce deceptive documents or credential-harvesting pages are not permitted.",
    test: (p) => FRAUD_ARTIFACT.test(p) && FRAUD_FRAME.test(p),
  },
  {
    category: "malware",
    reason: "Requests relating to malicious software are not permitted.",
    test: (p) => MALWARE.test(p),
  },
  {
    category: "sexual",
    reason: "Requests for sexually explicit content are not permitted.",
    // Two independent explicit markers, so a single word like "sexy" — common in
    // ad copy — never trips this on its own.
    test: (p) => {
      const hard = words("porn", "porno", "pornographic", "xxx", "hardcore", "explicit sex");
      return hard.test(p) && SEXUAL.test(p);
    },
  },
];

/**
 * Screen a user prompt. Returns the FIRST matching category, most severe first
 * (rule order is the severity order).
 */
export function moderatePrompt(prompt: string): ModerationResult {
  // Normalise separators used to evade word boundaries: c.h.i.l.d, f-a-g,
  // and runs of whitespace. Keeps letters/digits adjacent for \b matching.
  const normalised = prompt
    .toLowerCase()
    .replace(/[._\-*]+(?=[a-z0-9])/g, "")
    .replace(/\s+/g, " ")
    .trim();

  for (const rule of RULES) {
    if (rule.test(normalised) || rule.test(prompt.toLowerCase())) {
      return { ok: false, category: rule.category, reason: rule.reason };
    }
  }
  return OK;
}
