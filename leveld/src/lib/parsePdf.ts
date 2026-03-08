// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js")

export async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer)
  return result.text
}
