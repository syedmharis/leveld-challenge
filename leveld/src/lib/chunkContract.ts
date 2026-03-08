export function chunkContract(text: string) {
  const CLAUSE_REGEX =
    /(?:^|\n)(SECTION\s+\d+|CLAUSE\s+\d+|\d{1,2}\.\s+[A-Z][^\n]*)/g

  const matches = [...text.matchAll(CLAUSE_REGEX)]

  const chunks: string[] = []

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!
    const end =
      i + 1 < matches.length
        ? matches[i + 1].index!
        : text.length

    const chunk = text.slice(start, end).trim()

    if (chunk.length > 200) {
      chunks.push(chunk)
    }
  }

  return chunks
}