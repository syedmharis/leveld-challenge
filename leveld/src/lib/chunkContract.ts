// ─── Text Cleaning (runs before chunking) ─────────────────────────────────────

/**
 * Strip repeated headers, footers, page-break artifacts, watermarks.
 * This fixes the root cause — dirty text shifts clause boundaries.
 */
export function cleanContractText(raw: string): string {
  let text = raw

  // Normalize line endings
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  // Remove pdf2json page break markers (both formats)
  text = text.replace(/[-─]{3,}Page\s*\(\d+\)\s*Break[-─]{3,}/gi, "\n")
  text = text.replace(/----------------Page \(\d+\) Break----------------/gi, "\n")

  // Remove repeated headers/footers — generalized patterns
  // "STRICTLY CONFIDENTIAL ... Ref: XXX-MSA-YYYY-NNN"
  text = text.replace(/STRICTLY CONFIDENTIAL[^\n]*Ref:\s*[\w-]+[^\n]*/gi, "")
  // "CompanyName · Document Title · Confidential ... Page X of Y"
  text = text.replace(/^[^\n]*·[^\n]*·\s*Confidential[^\n]*/gm, "")
  // Standalone "Page X of Y"
  text = text.replace(/^\s*Page\s+\d+\s+of\s+\d+\s*$/gm, "")
  // "ANNEX X — Title ... Page X of Y" (footer in annex pages)
  text = text.replace(/^ANNEX\s+\w+\s*—[^\n]*Page\s+\d+\s+of\s+\d+[^\n]*/gm, "")

  // Remove standalone "DRAFT" watermarks (but not "Draft v0.7" in real content)
  text = text.replace(/^\s*DRAFT\s*$/gm, "")

  // Collapse 3+ blank lines → 2
  text = text.replace(/\n{3,}/g, "\n\n")

  return text.trim()
}

// ─── Boilerplate Detection ─────────────────────────────────────────────────────

/**
 * Sections that are structural/administrative with no meaningful risk to score.
 * The AI still receives them tagged as [SKIP] — this cuts ~15-20% of clause tokens.
 */
const BOILERPLATE_PATTERNS = [
  /^\s*(?:PARTIES|BACKGROUND|RECITALS|PREAMBLE|INTRODUCTION)\b/i,
  /^\s*EXECUTION\b/i,
  /^\s*(?:SIGNATURE|SIGNATURES|SIGNING)\b/i,
  /^\s*(?:IN WITNESS WHEREOF|SIGNED BY|EXECUTED BY)\b/i,
  /^\s*(?:SCHEDULE\s+\d+\s*[:—]\s*)?(?:DEFINITIONS|INTERPRETATION)\b/i,
]

export function isBoilerplateChunk(chunk: string): boolean {
  const firstLine = chunk.split("\n")[0]
  return BOILERPLATE_PATTERNS.some((p) => p.test(firstLine))
}

// ─── Clause Chunking ───────────────────────────────────────────────────────────

/**
 * Regex-based clause segmentation with cleaned text.
 *
 * Handles:
 *  - "CLAUSE 2 — PROVISION OF SERVICES"
 *  - "SECTION 4 — FEES AND PAYMENT"
 *  - "5. INTELLECTUAL PROPERTY"
 *  - "12. TERMINATION"
 *  - "ANNEX A — SCHEDULE OF FEES"
 *  - "PARTIES" / "BACKGROUND" preamble headings
 *
 * Sentence-boundary awareness: if a heading match lands mid-sentence
 * (previous char is not a newline, period, or start-of-string), the chunk
 * boundary is walked back to the nearest sentence end so clauses are never
 * split mid-sentence.
 */
export function chunkContract(rawText: string): string[] {
  const text = cleanContractText(rawText)

  // Multi-pattern heading regex — most specific patterns first.
  // NOTE: the numeric heading pattern (\d{1,2}\.) requires ALL-CAPS content (≥2 uppercase words)
  // to avoid matching sub-clause references like "1.2 References to a Clause..." which are
  // prose sentences beginning with a lowercase-majority label, not top-level headings.
  const CLAUSE_HEADING =
    /(?:^|\n)\s*(?:(?:CLAUSE|SECTION)\s+\d+[\s.—\-:]+[^\n]*|\d{1,2}\.\s+[A-Z]{2,}(?:\s+[A-Z&,]+){0,}[^\n]*|ANNEX\s+[A-Z][\s.—\-:]+[^\n]*|(?:PARTIES|BACKGROUND|EXECUTION|SIGNATURES?|DEFINITIONS|INTERPRETATION)\b[^\n]*)/gi

  const matches = [...text.matchAll(CLAUSE_HEADING)]

  if (matches.length === 0) {
    // Fallback: return whole text as one chunk if no headings found
    return text.length > 200 ? [text] : []
  }

  // Compute sentence-safe start positions for each match.
  // If the character immediately before a match is mid-sentence (not \n or .)
  // walk back to the last sentence-ending punctuation so we don't split prose.
  const safeStarts: number[] = matches.map((m) => {
    const pos = m.index!
    if (pos === 0) return pos
    const preceding = text.slice(Math.max(0, pos - 1), pos)
    // Already at a line/sentence boundary — use as-is
    if (/[\n.]/.test(preceding)) return pos
    // Walk back up to 120 chars to find the nearest sentence end
    const lookback = text.slice(Math.max(0, pos - 120), pos)
    const sentenceEnd = lookback.search(/[.!?]\s+[A-Z]/)
    if (sentenceEnd !== -1) {
      // sentenceEnd points to the punctuation; advance past it + whitespace
      const absEnd = Math.max(0, pos - 120) + sentenceEnd + 1
      return absEnd
    }
    return pos
  })

  const chunks: string[] = []

  // Capture preamble (everything before first heading) if substantial
  if (safeStarts[0] > 200) {
    chunks.push(text.slice(0, safeStarts[0]).trim())
  }

  // Extract each clause: from its heading to the next heading
  for (let i = 0; i < matches.length; i++) {
    const start = safeStarts[i]
    const end = i + 1 < matches.length ? safeStarts[i + 1] : text.length
    const chunk = text.slice(start, end).trim()

    // Merge tiny orphan fragments (sentence-boundary walkback may produce a sliver
    // of prose that belongs to the previous clause) into the preceding chunk.
    // Threshold: 300 chars — anything shorter is a continuation, not a clause.
    if (chunk.length < 300 && chunks.length > 0) {
      chunks[chunks.length - 1] += "\n" + chunk
    } else if (chunk.length > 0) {
      chunks.push(chunk)
    }
  }

  return chunks
}
