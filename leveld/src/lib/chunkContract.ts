/**
 * Stage 2 — Clause Chunking
 *
 * Splits a contract into logical clauses using:
 * - Numbered/lettered clause headings (e.g. "1.", "2.1", "A.", "(a)")
 * - Paragraph boundaries (double newlines)
 * - Never cuts mid-sentence
 */

const MIN_CHUNK_LENGTH = 60
const MAX_CHUNKS = 80

// Matches common clause/section heading patterns at the start of a line:
// "1.", "1.1", "2.3.4", "A.", "(a)", "(i)", "Section 1", "Clause 2", "Article III"
const CLAUSE_HEADING = /^(?:(?:Section|Clause|Article|Schedule|Exhibit|Annex)\s+[\w.]+|[\dA-Z]+(?:\.\d+)*\.|[A-Z]\.|[([)\d][a-z][)\d])\b/i

function splitIntoParagraphs(text: string): string[] {
  // Normalize line endings, then split on blank lines
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

function endsWithCompleteSentence(text: string): boolean {
  // A paragraph ending with . ! ? is a complete sentence boundary
  return /[.!?]["')\]]*\s*$/.test(text)
}

export function chunkContract(text: string): string[] {
  const paragraphs = splitIntoParagraphs(text)
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    const firstLine = para.split("\n")[0]
    const startsNewClause = CLAUSE_HEADING.test(firstLine)

    if (startsNewClause && current.length > 0) {
      // Flush the accumulated clause when a new numbered clause begins
      if (current.length >= MIN_CHUNK_LENGTH) {
        chunks.push(current.trim())
      }
      current = para
    } else if (current.length === 0) {
      current = para
    } else {
      // Append paragraph to current clause
      // But if current already ends a sentence AND next para also starts a clause-like heading,
      // flush first to avoid merging unrelated clauses
      if (endsWithCompleteSentence(current) && current.length >= MIN_CHUNK_LENGTH && startsNewClause) {
        chunks.push(current.trim())
        current = para
      } else {
        current = current + "\n\n" + para
      }
    }
  }

  // Flush remaining
  if (current.trim().length >= MIN_CHUNK_LENGTH) {
    chunks.push(current.trim())
  }

  return chunks.slice(0, MAX_CHUNKS)
}
