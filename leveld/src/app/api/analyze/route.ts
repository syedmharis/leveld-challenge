import { parsePdf } from "@/lib/parsePdf"
import { chunkContract } from "@/lib/chunkContract"
import { runAiPipeline } from "@/lib/aiPipeline"

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(sseEvent(data)))

      try {
        const formData = await req.formData()
        const file = formData.get("file") as File | null
        const text = formData.get("text") as string | null

        let contractText: string

        send({ type: "stage", stage: 1, label: "Parsing contract document" })

        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer())
          contractText = await parsePdf(buffer)
        } else if (text && text.trim().length > 0) {
          contractText = text.trim()
        } else {
          send({ type: "error", message: "No file or text provided." })
          controller.close()
          return
        }

        send({ type: "stage", stage: 2, label: "Splitting into clauses" })
        const chunks = chunkContract(contractText)

        if (chunks.length === 0) {
          send({ type: "error", message: "Could not extract any clauses from the contract." })
          controller.close()
          return
        }

        const result = await runAiPipeline(chunks, contractText, (stage, label) => {
          send({ type: "stage", stage, label })
        })

        send({ type: "done", result })
      } catch (err) {
        console.error("Analyze error:", err)
        const raw = err instanceof Error ? err.message : ""
        let message = "Failed to analyze contract. Please try again."
        if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED") || raw.includes("quota") || raw.includes("rate_limit")) {
          message = "AI quota exceeded — wait a moment and try again, or check your Groq API billing."
        } else if (raw.includes("API_KEY") || raw.includes("401") || raw.includes("403")) {
          message = "Invalid or missing Groq API key. Check GROQ_API_KEY in your .env.local file."
        }
        send({ type: "error", message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
