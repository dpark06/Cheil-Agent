// Every AI-pipeline prompt in this app that lists multiple DetectedChange
// rows labels each one `id=<cuid>` so the model can reference it in
// structured fields like `changeIds` — see 03-relationship-mapper.ts and
// 04-review-deck-planner.ts. That's necessary for the model to do its job,
// but it also means a real internal identifier sits right next to the
// prose the model is asked to write, in a `key=value` shape a weaker model
// (the local Ollama provider in particular) can echo straight into a title
// or explanation instead of keeping to itself. This is a deterministic
// safety net for that leak, applied to every user-facing string a stage
// produces — not a fix at the prompt level, which is a hint, not a
// guarantee (same reasoning as the edited-text enforcement in stage 04).

// Prisma's default cuid(): a lowercase-alphanumeric token, always starting
// with "c", generally 24-25 characters — matched narrowly (this length,
// this alphabet, this position) so it doesn't clip ordinary long lowercase
// words or run-together strings a real explanation might legitimately need.
const CUID_PATTERN = /\bc[a-z0-9]{23,26}\b/g;

// Catches the raw `id=`, `key=`, `ref=`, `token=` prompt-format fragments
// themselves, in case a model echoes the label along with the value, or
// the value isn't quite cuid-shaped (truncated, mangled, etc). The leading
// bracket is optional-but-consumed so "(id=...)" doesn't leave a dangling
// unmatched "(" behind — the trailing one is already swept up by \S+.
const KEY_VALUE_PATTERN = /[(\[]?\b(?:id|key|ref|token)\s*[:=]\s*\S+/gi;

export function stripInternalTokens(text: string): string {
  return text
    .replace(KEY_VALUE_PATTERN, "")
    .replace(CUID_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s*[-–—,:]\s*(?=[-–—,:]|$)/g, "") // leftover " - ", ", ,", ": " etc. from a stripped token
    .replace(/^[\s\-–—,:]+|[\s\-–—,:]+$/g, "")
    .trim();
}

// Markdown emphasis/code markers and other formatting symbols a plain-text
// prose sentence has no business containing — a model asked for "one clean
// sentence" can still slip into list/markdown habits (**bold**, `code`,
// stray pipe-table characters) especially a smaller local model.
const FORMATTING_SYMBOLS_PATTERN = /[*_`~|#]+/g;

/**
 * Deterministic length + cleanliness ceiling for a short AI-written summary
 * (currently: DetectedChange.explainerOutput.observedDifference — the field
 * shown as "Observed" in the review UI and, unless edited, the deck's
 * slide body). The schema's max() is a soft ceiling — it triggers a retry
 * with a correction prompt, but a model can still exhaust its retries and
 * fail, or a weaker/local model can just ignore the number. This runs
 * unconditionally after validation so the text a user actually sees is
 * always short and clean regardless of what the model produced —
 * "guarantee, not a hint," same reasoning as every other sanitizer here.
 */
export function cleanAndCapSummary(text: string, maxChars = 160): string {
  const cleaned = text
    .replace(FORMATTING_SYMBOLS_PATTERN, "")
    .replace(/\s*\n+\s*/g, " ") // one sentence, not multiple lines
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1") // no space before punctuation left by a stripped symbol
    .trim();

  if (cleaned.length <= maxChars) {
    // Under the cap doesn't mean complete — a provider can stop generating
    // mid-sentence for its own reasons (context window, not just our
    // length cap). A sentence with no closing punctuation reads exactly
    // like the broken "raw system text" this exists to prevent, so treat
    // it the same as an over-length truncation: fall back to the last full
    // sentence if there is one, otherwise mark it as cut off honestly.
    if (/[.!?…]$/.test(cleaned) || cleaned === "") return cleaned;
    return truncateAtSentenceOrWord(cleaned, cleaned.length);
  }

  return truncateAtSentenceOrWord(cleaned, maxChars);
}

function truncateAtSentenceOrWord(cleaned: string, maxChars: number): string {
  const truncated = cleaned.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? "),
  );
  if (lastSentenceEnd > maxChars * 0.4) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}
