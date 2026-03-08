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
 */
export function chunkContract(rawText: string): string[] {
  const text = cleanContractText(rawText)

  // Multi-pattern heading regex — most specific patterns first
  const CLAUSE_HEADING =
    /(?:^|\n)\s*(?:(?:CLAUSE|SECTION)\s+\d+[\s.—\-:]+[^\n]*|\d{1,2}\.\s+[A-Z][A-Z\s&,]+[^\n]*|ANNEX\s+[A-Z][\s.—\-:]+[^\n]*|(?:PARTIES|BACKGROUND|EXECUTION)\b[^\n]*)/gi

  const matches = [...text.matchAll(CLAUSE_HEADING)]

  if (matches.length === 0) {
    // Fallback: return whole text as one chunk if no headings found
    return text.length > 200 ? [text] : []
  }

  const chunks: string[] = []

  // Capture preamble (everything before first heading) if substantial
  const firstMatchStart = matches[0].index!
  if (firstMatchStart > 200) {
    chunks.push(text.slice(0, firstMatchStart).trim())
  }

  // Extract each clause: from its heading to the next heading
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length
    const chunk = text.slice(start, end).trim()

    // Skip tiny fragments (headings with no real content)
    if (chunk.length > 150) {
      chunks.push(chunk)
    }
  }

  return chunks
}