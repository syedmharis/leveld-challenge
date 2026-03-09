"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { UploadCloud, FileText, X, AlertCircle } from "lucide-react"
import { AnalysisLoader } from "@/components/analysis-loader"
import { useAnalysisStore } from "@/lib/store"

export default function Home() {
  const router = useRouter()
  const setAnalysis = useAnalysisStore((s) => s.setAnalysis)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [currentStage, setCurrentStage] = useState(1)
  const [error, setError] = useState("")

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === "application/pdf") {
      setFile(dropped)
      setText("")
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setText("")
    }
  }

  async function handleAnalyze() {
    if (!file && !text.trim()) {
      setError("Please upload a PDF or paste contract text.")
      return
    }

    setError("")
    setLoading(true)
    setCurrentStage(1)

    const formData = new FormData()
    if (file) formData.append("file", file)
    else formData.append("text", text)

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData })

      if (!res.ok || !res.body) {
        throw new Error("Analysis failed.")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let event: { type: string; stage?: number; result?: unknown; message?: string }
          try {
            event = JSON.parse(raw)
          } catch {
            continue // skip genuinely malformed JSON lines
          }

          if (event.type === "stage") {
            setCurrentStage(event.stage ?? currentStage)
          } else if (event.type === "done") {
            setCurrentStage(5)
            await new Promise((r) => setTimeout(r, 800))
            setAnalysis(event.result as Parameters<typeof setAnalysis>[0])
            router.push("/dashboard")
            return
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Analysis failed.")
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setLoading(false)
      setCurrentStage(1)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Contract Risk Extractor</h1>
          <p className="text-muted-foreground">
            Upload a contract PDF or paste the text to surface hidden risks in seconds.
          </p>
        </div>

        <Card>
          {loading ? (
            <CardContent className="py-6 space-y-4">
              <AnalysisLoader currentStage={currentStage} />
              {error && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Analysis failed</p>
                    <p className="mt-0.5 text-destructive/80">{error}</p>
                    <button
                      onClick={() => { setLoading(false); setError(""); setCurrentStage(1) }}
                      className="mt-2 text-xs underline underline-offset-2 hover:no-underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Upload Contract</CardTitle>
                <CardDescription>PDF upload or paste contract text below.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => !file && fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:bg-muted/50"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {file ? (
                    <div className="flex items-center gap-3">
                      <FileText className="size-5 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFile(null) }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="size-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Drag &amp; drop a PDF or <span className="text-primary underline">browse</span>
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  <span>or paste text</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <Textarea
                  placeholder="Paste contract text here..."
                  rows={8}
                  value={text}
                  onChange={(e) => { setText(e.target.value); setFile(null) }}
                  disabled={!!file}
                  className="resize-none"
                />

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  onClick={handleAnalyze}
                  disabled={!file && !text.trim()}
                  className="w-full"
                  size="lg"
                >
                  Analyze Contract
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
