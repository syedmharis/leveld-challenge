"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, FileText, Scissors, Brain, LayoutDashboard, Database } from "lucide-react"
import { cn } from "@/lib/utils"

export const PIPELINE_STEPS = [
  { stage: 1, icon: FileText, label: "Parsing contract document", detail: "Extracting text and structure from your file…" },
  { stage: 2, icon: Scissors, label: "Splitting into clauses", detail: "Intelligently chunking content to fit AI context limits…" },
  { stage: 3, icon: Database, label: "Extracting contract metadata", detail: "Identifying parties, reference numbers, contract value…" },
  { stage: 4, icon: Brain, label: "Analysing clauses & scoring risk", detail: "Classifying each clause, scoring risk, and generating plain-English explanations…" },
  { stage: 5, icon: LayoutDashboard, label: "Generating executive summary", detail: "Synthesising overall contract risk posture for your review…" },
]

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("")

  useEffect(() => {
    setDisplayed("")
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(interval)
    }, 20)
    return () => clearInterval(interval)
  }, [text])

  return (
    <span>
      {displayed}
      {displayed.length < text.length && <span className="animate-pulse text-primary">|</span>}
    </span>
  )
}

export function AnalysisLoader({ currentStage }: { currentStage: number }) {
  return (
    <div className="w-full space-y-6">
      <div className="space-y-2.5">
        {PIPELINE_STEPS.map((step) => {
          const done = step.stage < currentStage
          const active = step.stage === currentStage
          const pending = step.stage > currentStage
          const Icon = step.icon

          return (
            <div
              key={step.stage}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-4 py-3 transition-all duration-500",
                done && "border-green-500/20 bg-green-500/5",
                active && "border-primary/30 bg-primary/5 shadow-sm",
                pending && "border-border/30 bg-transparent opacity-35",
              )}
            >
              <div
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
                  done && "border-green-500/40 bg-green-500/10 text-green-500",
                  active && "border-primary/40 bg-primary/10 text-primary",
                  pending && "border-border/50 bg-muted/30 text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Icon className="size-3.5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-sm font-medium leading-snug",
                  done && "text-green-600 dark:text-green-400",
                  active && "text-foreground",
                  pending && "text-muted-foreground",
                )}>
                  {active ? <TypewriterText text={step.label} /> : step.label}
                </p>
                {active && (
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    <TypewriterText text={step.detail} />
                  </p>
                )}
                {done && (
                  <p className="mt-0.5 text-xs text-green-600/60 dark:text-green-400/60">Complete</p>
                )}
              </div>

              {done && <span className="mt-0.5 shrink-0 text-xs font-semibold text-green-500">✓</span>}
            </div>
          )
        })}
      </div>

      {/* Progress bar based on stage */}
      <div className="space-y-1.5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${Math.round(((currentStage - 1) / (PIPELINE_STEPS.length - 1)) * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Analyzing with Groq AI</span>
          <span>Step {Math.min(currentStage, PIPELINE_STEPS.length)} of {PIPELINE_STEPS.length}</span>
        </div>
      </div>
    </div>
  )
}
