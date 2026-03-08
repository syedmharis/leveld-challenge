"use client"

import { useEffect, useState } from "react"
import { useAnalysisStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import type { ClauseAnalysis } from "@/lib/types"
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  Hash,
  FileText,
  ChevronRight,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Risk accent — only color used ────────────────────────────────────────────
// High → red, Medium → amber (just dot/label), Low → nothing special

const RISK_DOT: Record<string, string> = {
  High:   "bg-destructive",
  Medium: "bg-amber-400",
  Low:    "bg-muted-foreground/40",
}

const RISK_TEXT: Record<string, string> = {
  High:   "text-destructive",
  Medium: "text-amber-600 dark:text-amber-400",
  Low:    "text-muted-foreground",
}

// ─── Clause list item ─────────────────────────────────────────────────────────

function ClauseListItem({
  clause,
  active,
  onClick,
}: {
  clause: ClauseAnalysis
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left px-4 py-3 border-b border-border transition-colors focus:outline-none",
        active ? "bg-accent" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Risk dot */}
        <span className={cn("mt-1.5 size-1.5 rounded-full shrink-0", RISK_DOT[clause.risk])} />

        <div className="flex-1 min-w-0">
          {/* Ref + flags */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[11px] font-mono text-muted-foreground">{clause.clauseRef}</span>
            <div className="flex items-center gap-1 shrink-0">
              {clause.isAmendment && (
                <span className="text-[9px] font-semibold tracking-widest uppercase text-muted-foreground border border-border rounded px-1 py-px">
                  AMD
                </span>
              )}
              {clause.reviewerNote && (
                <span className="text-[9px] font-semibold tracking-widest uppercase text-muted-foreground border border-border rounded px-1 py-px">
                  NOTE
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <p className="text-[13px] font-medium leading-snug truncate text-foreground mb-1">
            {clause.title}
          </p>

          {/* Type + risk label */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground capitalize">
              {clause.type.replace(/_/g, " ")}
            </span>
            <span className={cn("text-[11px] font-semibold", RISK_TEXT[clause.risk])}>
              {clause.risk}
            </span>
          </div>
        </div>

        <ChevronRight className={cn(
          "size-3.5 mt-1 shrink-0 transition-opacity text-muted-foreground",
          active ? "opacity-50" : "opacity-0 group-hover:opacity-30",
        )} />
      </div>
    </button>
  )
}

// ─── Clause detail panel ──────────────────────────────────────────────────────

function ClauseDetail({ clause }: { clause: ClauseAnalysis }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono text-muted-foreground">{clause.clauseRef}</span>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground capitalize">{clause.type.replace(/_/g, " ")}</span>
            </div>
            <h2 className="text-base font-semibold text-foreground leading-snug">{clause.title}</h2>
          </div>
          <span className={cn("shrink-0 text-[11px] font-bold uppercase tracking-wide mt-0.5", RISK_TEXT[clause.risk])}>
            {clause.risk} Risk
          </span>
        </div>

        {/* Banners */}
        {clause.isAmendment && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-foreground/80">
            <AlertTriangle className="size-3.5 shrink-0 mt-px text-amber-500" />
            <span>Contains an inline amendment — formal change control may not have been followed.</span>
          </div>
        )}
        {clause.reviewerNote && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-foreground/80">
            <AlertTriangle className="size-3.5 shrink-0 mt-px text-muted-foreground" />
            <div><span className="font-semibold">Note: </span>{clause.reviewerNote}</div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-6 py-6 space-y-6">

        {/* Original text */}
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Original Text</p>
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-[12px] font-mono leading-relaxed text-foreground/70 whitespace-pre-wrap">
            {clause.text.length > 900 ? clause.text.slice(0, 900) + "…" : clause.text}
          </div>
        </section>

        {/* Analysis */}
        {clause.explanation && clause.explanation !== "No immediate action required." && (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Analysis</p>
            <p className="text-[13px] leading-relaxed text-foreground">{clause.explanation}</p>
          </section>
        )}

        {/* Recommendation */}
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Recommendation</p>
          <div className={cn(
            "rounded-md border px-4 py-3 text-[13px] leading-relaxed",
            clause.risk === "High"
              ? "border-destructive/30 bg-destructive/5 text-foreground"
              : "border-border bg-muted/20 text-foreground",
          )}>
            {clause.recommendation}
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const analysis = useAnalysisStore((s) => s.analysis)
  const [selected, setSelected] = useState<ClauseAnalysis | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [search, setSearch] = useState("")
  const [riskFilter, setRiskFilter] = useState<"All" | "High" | "Medium" | "Low">("High")

  useEffect(() => {
    if (!analysis) router.push("/")
  }, [analysis, router])

  const effectiveSelected = selected ?? analysis?.clauses.find((c) => c.risk === "High") ?? analysis?.clauses[0] ?? null

  if (!analysis) return null

  const { meta, summary, clauses } = analysis

  const filtered = clauses.filter((c) => {
    const matchesRisk = riskFilter === "All" || c.risk === riskFilter
    const q = search.toLowerCase()
    const matchesSearch = !q || c.title.toLowerCase().includes(q) || c.clauseRef.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)
    return matchesRisk && matchesSearch
  })

  function selectClause(clause: ClauseAnalysis) {
    setSelected(clause)
    setMobileDetail(true)
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden min-h-0">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-background">

        {/* Top bar: nav + contract identity + risk verdict */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border/60">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push("/")}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <ArrowLeft className="size-3.5" />
            </button>
            <div className="w-px h-4 bg-border shrink-0" />
            <FileText className="size-3.5 text-muted-foreground shrink-0" />
            <h1 className="text-sm font-semibold text-foreground truncate">{meta.title}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
              {meta.supplier && meta.supplier !== "Unknown" && (
                <span className="flex items-center gap-1"><Building2 className="size-3" />{meta.supplier}</span>
              )}
              {meta.reference && meta.reference !== "N/A" && (
                <span className="flex items-center gap-1 font-mono"><Hash className="size-3" />{meta.reference}</span>
              )}
              {meta.version && meta.version !== "N/A" && (
                <span className="text-muted-foreground/50">{meta.version}</span>
              )}
            </div>
          </div>

          {/* Risk verdict pill */}
          <div className={cn(
            "flex items-center gap-2 shrink-0 rounded-md border px-3 py-1.5",
            summary.overallRisk === "High"
              ? "border-destructive/30 bg-destructive/5"
              : summary.overallRisk === "Medium"
              ? "border-amber-300/50 bg-amber-50/50 dark:border-amber-700/30 dark:bg-amber-950/20"
              : "border-border bg-muted/30",
          )}>
            <span className={cn(
              "size-2 rounded-full shrink-0",
              summary.overallRisk === "High" ? "bg-destructive" : summary.overallRisk === "Medium" ? "bg-amber-400" : "bg-muted-foreground/40",
            )} />
            <span className={cn(
              "text-xs font-bold uppercase tracking-widest",
              summary.overallRisk === "High" ? "text-destructive" : summary.overallRisk === "Medium" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}>
              {summary.overallRisk} Risk
            </span>
          </div>
        </div>

        {/* Summary body: counts + narrative + issues */}
        <div className="px-5 py-4 flex gap-8">

          {/* Clause counts */}
          <div className="shrink-0 flex flex-col gap-3 pr-8 border-r border-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Risk Breakdown</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-destructive shrink-0" />
                <span className="text-sm font-semibold text-foreground w-5 tabular-nums">{summary.highCount}</span>
                <span className="text-xs text-muted-foreground">High</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-sm font-semibold text-foreground w-5 tabular-nums">{summary.mediumCount}</span>
                <span className="text-xs text-muted-foreground">Medium</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-muted-foreground/30 shrink-0" />
                <span className="text-sm font-semibold text-foreground w-5 tabular-nums">{summary.lowCount}</span>
                <span className="text-xs text-muted-foreground">Low</span>
              </div>
            </div>
          </div>

          {/* Narrative + top issues */}
          <div className="flex-1 min-w-0 flex gap-8">

            {/* Narrative */}
            {summary.narrative && (
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Overview</p>
                <p className="text-[13px] text-foreground/80 leading-relaxed">{summary.narrative}</p>
              </div>
            )}

            {/* Top issues */}
            {summary.topIssues.length > 0 && (
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Key Issues</p>
                <div className="space-y-2">
                  {summary.topIssues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 size-1.5 rounded-full bg-destructive shrink-0" />
                      <p className="text-[13px] text-foreground/80 leading-relaxed">{issue}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Split layout ── */}
      <div className="flex flex-1 min-h-0">

        {/* Left: clause list */}
        <div className={cn(
          "w-full md:w-72 lg:w-80 shrink-0 border-r border-border flex flex-col min-h-0 overflow-hidden",
          mobileDetail ? "hidden md:flex" : "flex",
        )}>

          {/* Toolbar */}
          <div className="shrink-0 px-3 py-2.5 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search clauses…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex gap-1">
              {(["All", "High", "Medium", "Low"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskFilter(r)}
                  className={cn(
                    "flex-1 text-[10px] font-medium py-1 rounded transition-colors",
                    riskFilter === r
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground">
              {filtered.length} of {clauses.length} clauses
            </p>
          </div>

          {/* Scrollable clause list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                No clauses match your filter.
              </p>
            ) : (
              filtered.map((clause) => (
                <ClauseListItem
                  key={clause.id}
                  clause={clause}
                  active={effectiveSelected?.id === clause.id}
                  onClick={() => selectClause(clause)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className={cn(
          "flex-1 min-w-0 overflow-hidden",
          mobileDetail ? "flex flex-col" : "hidden md:flex md:flex-col",
        )}>
          <div className="md:hidden px-4 py-2 border-b border-border shrink-0">
            <button
              onClick={() => setMobileDetail(false)}
              className="text-[12px] text-muted-foreground flex items-center gap-1 hover:text-foreground"
            >
              <ArrowLeft className="size-3" /> Back to clauses
            </button>
          </div>

          {effectiveSelected ? (
            <ClauseDetail clause={effectiveSelected} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Select a clause to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
