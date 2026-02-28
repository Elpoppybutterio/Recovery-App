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

function normalizeWisdomText(rawText: string): string {
  let normalized = rawText;
  for (const rule of WISDOM_REPLACEMENT_RULES) {
    normalized = applyWholeWordReplacement(normalized, rule);
  }
  for (const rule of WISDOM_GRAMMAR_FIXUPS) {
    normalized = applyWholeWordReplacement(normalized, rule);
  }
  return normalized;
}

const NORMALIZED_WISDOM_QUOTES = RAW_WISDOM_QUOTES.map((quote) => normalizeWisdomText(quote));

function hashString32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type DailyWisdomPayload = {
  id: string;
  date: string;
  tz: string;
  index: number;
  text: string;
};

export function getWisdomCacheKey(date: string, tz: string): string {
  return `wisdom_daily_${date}_${tz}`;
}

export function getLocalDailyWisdomQuote(date: string, tz: string): DailyWisdomPayload {
  const index = hashString32(`${date}|${tz}`) % NORMALIZED_WISDOM_QUOTES.length;
  return {
    id: `wisdom_${date}_${String(index).padStart(2, "0")}`,
    date,
    tz,
    index,
    text: NORMALIZED_WISDOM_QUOTES[index],
  };
}
