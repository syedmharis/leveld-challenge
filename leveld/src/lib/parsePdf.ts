import PDFParser from "pdf2json"

export async function parsePdf(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParser = new (PDFParser as any)(null, 1)

    pdfParser.on("pdfParser_dataError", (err: { parserError: string }) => {
      reject(new Error(err.parserError))
    })

    pdfParser.on("pdfParser_dataReady", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve((pdfParser as any).getRawTextContent() as string)
    })

    pdfParser.parseBuffer(buffer)
  })
}
