"use client"

import { useEffect, useState } from "react"
import { useAnalysisStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { ClauseAnalysis } from "@/lib/types"
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  AlertTriangle,
  Download,
  Building2,
  Hash,
  Calendar,
  DollarSign,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Color maps ───────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  liability: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  payment: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IP: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  termination: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  confidentiality: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "change control": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  other: "bg-muted text-muted-foreground",
}

const RISK_DOT: Record<string, string> = {
  High: "bg-red-500",
  Medium: "bg-amber-500",
  Low: "bg-slate-400",
}

const RISK_BADGE: Record<string, string> = {
  High: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  Medium: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  Low: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
}

const OVERALL_RISK_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  High: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800" },
  Medium: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" },
  Low: { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-400", border: "border-green-200 dark:border-green-800" },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskIcon({ risk }: { risk: string }) {
  if (risk === "High") return <ShieldAlert className="size-5 text-red-500" />
  if (risk === "Low") return <ShieldCheck className="size-5 text-green-500" />
  return <ShieldQuestion className="size-5 text-amber-500" />
}

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
        "w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/50 focus:outline-none",
        active && "bg-muted",
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={cn("size-2 shrink-0 rounded-full mt-2", RISK_DOT[clause.risk])} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-muted-foreground font-mono shrink-0">{clause.clauseRef}</span>
            {clause.isAmendment && (
              <span className="shrink-0 text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded uppercase tracking-wide">
                Amended
              </span>
            )}
            {clause.reviewerNote && (
              <span className="shrink-0 text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded uppercase tracking-wide">
                Note
              </span>
            )}
          </div>
          <p className="text-sm font-medium truncate mt-0.5">{clause.title}</p>
          <span className={cn("inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full", TYPE_COLORS[clause.type])}>
            {clause.type}
          </span>
        </div>
        <Badge variant="outline" className={cn("shrink-0 text-[10px] mt-0.5", RISK_BADGE[clause.risk])}>
          {clause.risk}
        </Badge>
      </div>
    </button>
  )
}

function ClauseDetail({ clause }: { clause: ClauseAnalysis }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-muted-foreground">{clause.clauseRef}</span>
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", TYPE_COLORS[clause.type])}>
                {clause.type}
              </span>
            </div>
            <h2 className="text-base font-semibold leading-snug">{clause.title}</h2>
          </div>
          <Badge variant="outline" className={cn("shrink-0", RISK_BADGE[clause.risk])}>
            {clause.risk} Risk
          </Badge>
        </div>

        {clause.isAmendment && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>This clause contains an inline amendment. Formal change control may not have been followed.</span>
          </div>
        )}
        {clause.reviewerNote && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span><strong>Reviewer note:</strong> {clause.reviewerNote}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-5 flex-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Original Text</p>
          <blockquote className="rounded-md border-l-4 border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground/80 italic">
            {clause.text.length > 600 ? clause.text.slice(0, 600) + "…" : clause.text}
          </blockquote>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Why This Is Risky</p>
          <p className="text-sm leading-relaxed text-foreground">{clause.explanation}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Recommendation</p>
          <div className={cn(
            "rounded-md border px-4 py-3 text-sm leading-relaxed",
            clause.risk === "High"
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
              : clause.risk === "Medium"
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
              : "border-border bg-muted/30 text-foreground",
          )}>
            {clause.recommendation}
          </div>
        </div>
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

  useEffect(() => {
    if (!analysis) {
      router.push("/")
    } else {
      setSelected(analysis.clauses[0] ?? null)
    }
  }, [analysis, router])

  if (!analysis) return null

  const { meta, summary, clauses } = analysis
  const riskStyle = OVERALL_RISK_STYLES[summary.overallRisk] ?? OVERALL_RISK_STYLES.Medium

  function selectClause(clause: ClauseAnalysis) {
    setSelected(clause)
    setMobileDetail(true)
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* ── Contract Header ── */}
      <div className="shrink-0 border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-2">
            <Button variant="ghost" size="icon" className="shrink-0 mt-0.5 size-8" onClick={() => router.push("/")}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-base font-semibold leading-tight">{meta.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {meta.supplier !== "Unknown" && (
                  <span className="flex items-center gap-1"><Building2 className="size-3" />{meta.supplier}</span>
                )}
                {meta.reference !== "N/A" && (
                  <span className="flex items-center gap-1"><Hash className="size-3" />{meta.reference}</span>
                )}
                {meta.version !== "N/A" && (
                  <span className="flex items-center gap-1"><Calendar className="size-3" />{meta.version}</span>
                )}
                {meta.estimatedValue && (
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <DollarSign className="size-3" />{meta.currency} {meta.estimatedValue.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5", riskStyle.bg, riskStyle.border)}>
              <RiskIcon risk={summary.overallRisk} />
              <div>
                <p className={cn("text-xs font-semibold uppercase tracking-wide leading-none", riskStyle.text)}>
                  {summary.overallRisk} Risk
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{clauses.length} clauses</p>
              </div>
            </div>
            <Button variant="outline" size="sm" disabled className="text-xs gap-1 h-8">
              <Download className="size-3.5" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats + narrative */}
        <div className="mt-2.5 flex flex-wrap items-start gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-500" />{summary.highCount} High</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" />{summary.mediumCount} Medium</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-slate-400" />{summary.lowCount} Low</span>
          </div>
          {summary.narrative && (
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">{summary.narrative}</p>
          )}
        </div>

        {/* Top issues */}
        {summary.topIssues.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {summary.topIssues.map((issue, i) => (
              <p key={i} className="text-xs text-foreground/70 flex items-start gap-1.5">
                <span className="text-red-500 font-bold shrink-0">·</span>{issue}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ── Inbox layout ── */}
      <div className="flex flex-1 min-h-0">
        {/* Clause list */}
        <div className={cn(
          "w-full md:w-72 lg:w-80 shrink-0 border-r border-border overflow-y-auto",
          mobileDetail ? "hidden md:flex md:flex-col" : "flex flex-col",
        )}>
          <div className="px-4 py-2 border-b border-border/50 bg-muted/20 sticky top-0 z-10">
            <p className="text-xs font-medium text-muted-foreground">{clauses.length} clauses analyzed</p>
          </div>
          {clauses.map((clause) => (
            <ClauseListItem
              key={clause.id}
              clause={clause}
              active={selected?.id === clause.id}
              onClick={() => selectClause(clause)}
            />
          ))}
        </div>

        {/* Detail panel */}
        <div className={cn(
          "flex-1 min-w-0 overflow-hidden",
          mobileDetail ? "flex flex-col" : "hidden md:flex md:flex-col",
        )}>
          <div className="md:hidden px-4 py-2 border-b border-border shrink-0">
            <button
              onClick={() => setMobileDetail(false)}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
            >
              <ArrowLeft className="size-3" /> Back to clauses
            </button>
          </div>

          {selected ? (
            <ClauseDetail clause={selected} />
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
