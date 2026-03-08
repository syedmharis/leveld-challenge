import { NextRequest, NextResponse } from "next/server"
import { parsePdf } from "@/lib/parsePdf"
import { chunkContract } from "@/lib/chunkContract"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Parse PDF
    const text = await parsePdf(buffer)
    
    // Chunk the contract
    const chunks = chunkContract(text)

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: file.size,
      text: text,
      characterCount: text.length,
      lineCount: text.split('\n').length,
      chunks: chunks,
      chunkCount: chunks.length
    })

  } catch (error) {
    console.error("Parse error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse PDF" },
      { status: 500 }
    )
  }
}
