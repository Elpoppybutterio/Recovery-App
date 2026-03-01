import { z } from "zod";

const RAW_WISDOM_QUOTES = [
  "Getting A Sponsor Is Simply A Suggestion, But So Is Pulling A Ripcord On A Parachute.",
  "We didn't come to AA because we had a bad weekend. We had a couple of bad decades. And for us, eventually, this becomes a matter of life and death.",
  "If God didn't give us more than we can handle, we wouldn't need God's help.",
  "If we are new, 'help' is the dirtiest little four letter word in AA.",
  "We have a body that cannot control our drinking, and a mind that cannot control our abstinence.",
  "We wear out defects on our back, where we can't see them.",
  "Humility is nobility, on its knees.",
  "The only thing we can take back from the future is fear.",
  "If we do what we ought to do, we will survive. If we do what we want to do we won't survive.",
] as const;

const WISDOM_SELECTION_SEED = "wisdom-v1";

type WisdomReplacementRule = {
  source: string;
  target: string;
};

const WISDOM_REPLACEMENT_RULES: WisdomReplacementRule[] = [
  { source: "I'm", target: "we're" },
  { source: "I've", target: "we've" },
  { source: "I'd", target: "we'd" },
  { source: "I'll", target: "we'll" },
  { source: "you're", target: "we're" },
  { source: "you've", target: "we've" },
  { source: "you'd", target: "we'd" },
  { source: "you'll", target: "we'll" },
  { source: "myself", target: "ourselves" },
  { source: "mine", target: "ours" },
  { source: "my", target: "our" },
  { source: "me", target: "us" },
  { source: "I", target: "we" },
  { source: "yourselves", target: "ourselves" },
  { source: "yourself", target: "ourselves" },
  { source: "yours", target: "ours" },
  { source: "your", target: "our" },
  { source: "you", target: "we" },
];

const WISDOM_GRAMMAR_FIXUPS: WisdomReplacementRule[] = [
  { source: "we is", target: "we are" },
  { source: "we was", target: "we were" },
  { source: "we has", target: "we have" },
  { source: "we does", target: "we do" },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAllCapsWord(value: string): boolean {
  const lettersOnly = value.replace(/[^A-Za-z]/g, "");
  return lettersOnly.length > 1 && lettersOnly === lettersOnly.toUpperCase();
}

function isSentenceInitial(text: string, index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const character = text[cursor];
    if (/\s/.test(character)) {
      continue;
    }
    return /[.!?]/.test(character);
  }
  return true;
}

function applyWholeWordReplacement(text: string, rule: WisdomReplacementRule): string {
  const pattern = new RegExp(`\\b${escapeRegex(rule.source)}\\b`, "gi");
  return text.replace(pattern, (matched, ...rest) => {
    const offset = rest[rest.length - 2] as number;
    if (isAllCapsWord(matched)) {
      return rule.target.toUpperCase();
    }
    if (isSentenceInitial(text, offset)) {
      return `${rule.target.charAt(0).toUpperCase()}${rule.target.slice(1)}`;
    }
    return rule.target;
  });
}

function isValidIsoDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function hashString32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeWisdomText(rawText: string): string {
  let normalized = rawText;
  for (const rule of WISDOM_REPLACEMENT_RULES) {
    normalized = applyWholeWordReplacement(normalized, rule);
  }
  for (const rule of WISDOM_GRAMMAR_FIXUPS) {
    normalized = applyWholeWordReplacement(normalized, rule);
  }
  return normalized;
}

const NORMALIZED_WISDOM_QUOTES = RAW_WISDOM_QUOTES.map((rawText, index) => ({
  id: `wisdom_quote_${String(index).padStart(2, "0")}`,
  rawText,
  text: normalizeWisdomText(rawText),
}));

export const wisdomDailyQuerySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tz: z.string().min(1).max(128).optional().default("America/Denver"),
  })
  .superRefine((value, ctx) => {
    if (!isValidIsoDateOnly(value.date)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "date must be a real calendar date",
      });
    }
    if (!isValidIanaTimeZone(value.tz)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tz"],
        message: "tz must be a valid IANA timezone",
      });
    }
  });

export type DailyWisdomQuote = {
  id: string;
  date: string;
  tz: string;
  index: number;
  text: string;
};

export function getDailyWisdomQuote(date: string, tz: string): DailyWisdomQuote {
  const index =
    hashString32(`${date}|${tz}|${WISDOM_SELECTION_SEED}`) % NORMALIZED_WISDOM_QUOTES.length;
  const selected = NORMALIZED_WISDOM_QUOTES[index];
  return {
    id: `wisdom_${date}_${String(index).padStart(2, "0")}`,
    date,
    tz,
    index,
    text: selected.text,
  };
}

export function getAllNormalizedWisdomQuotes(): readonly string[] {
  return NORMALIZED_WISDOM_QUOTES.map((quote) => quote.text);
}
