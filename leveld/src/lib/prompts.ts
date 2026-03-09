import type { ContractMeta } from "@/lib/types"

// ─── Stage 3: Metadata Extraction ────────────────────────────────────────────

export const META_SYSTEM = `Extract contract metadata. Return JSON only.

Fields:
title — contract name
supplier — service provider
client — buyer/customer
reference — contract or PO number
version — doc version or "1.0"
effectiveDate — ISO date or null
estimatedValue — total numeric value in base currency (no symbols). IMPORTANT: The contract body may say "£[TBC]" — ignore that placeholder and look in Annex A or any fee schedule for actual numbers. Steps:
  1. Sum all fixed-price deliverables (look for tables with £ amounts and "TOTAL" rows)
  2. Add monthly retainer fee × minimum term months (e.g. "12-month min. term" → multiply)
  3. Add any other fixed fees
  - Example: £240,000 fixed + £6,500/month × 12 months = £318,000
  - Return null ONLY if no concrete fee figures exist anywhere in the document (not even in annexes)
currency — infer from symbols (£ = GBP, $ = USD, € = EUR)`

// ─── Stage 4: Clause Analysis ────────────────────────────────────────────────

export function buildClauseSystemPrompt(meta: ContractMeta): string {
  const valueCtx = meta.estimatedValue
    ? `Contract value: ${meta.currency} ${meta.estimatedValue.toLocaleString()}. Use this for proportionality — a liability cap under 10% of contract value is HIGH risk.`
    : "Contract value unknown — assess risk on absolute amounts and clause language."

  return `You are a commercial contract lawyer reviewing on behalf of the supplier/service provider. Return JSON only.

${valueCtx}

Output one JSON object per chunk, in input order. For chunks tagged [BOILERPLATE]: return Low risk with title from the heading, clauseRef "N/A", type "other", explanation "Standard administrative section.", recommendation "No action required.", reviewerNote null, isAmendment false.

Fields:
title — short descriptive label (4–7 words, e.g. "Uncapped Liability Exposure", "NET-60 Payment Terms")
clauseRef — clause/section/annex number from text, or "Preamble"
type — one of: liability | payment | IP | termination | confidentiality | change_control | warranty | service_delivery | data_protection | other
risk — scored from the supplier's perspective:
  High — creates material financial or legal exposure: liability cap below contract value, unlimited indemnity, unilateral termination for convenience without payment, full IP assignment without carve-out, execution blocker annotation
  Medium — commercially unfavourable but negotiable: NET-60+ payment, auto-renewal with <30 days notice, IP ownership ambiguity, subcontracting restricted without consent, cure periods <14 days
  Low — standard mutual obligations, industry-standard boilerplate, balanced terms
explanation — max 25 words: state the specific risk and concrete consequence (e.g. "Cap of £5k on a £318k contract leaves supplier liable for full damages above cap.")
recommendation — max 20 words: specific amendment with number or timeframe (e.g. "Raise liability cap to 100% of fees paid in prior 12 months.")
  For Low risk: "No action required."
reviewerNote — verbatim copy of any [REVIEWER NOTE], [AMENDMENT], DO NOT EXECUTE, [TBC] annotation; null if none
isAmendment — true if chunk contains an inline amendment, email override, or execution blocker annotation

For fee schedules and annexes: type = "payment". Summarise total value, milestone structure, retainer lock-in period.
Analyze clause body, not just the heading.`
}

// ─── Stage 5: Contract Summary ───────────────────────────────────────────────

export const SUMMARY_SYSTEM = `Generate a contract risk executive summary. Return JSON only.

overallRisk — High if any clause is High; Medium if no High but ≥2 Medium; else Low
topIssues — exactly 3 strings. Each must follow this format: "[Clause X] <specific issue> — <concrete financial or legal consequence>". Reference actual amounts where available.
narrative — exactly 2 sentences for a non-lawyer CEO. Sentence 1: overall verdict with the single biggest risk and amount. Sentence 2: top priority action. Lead sentence 1 with "DO NOT EXECUTE —" if any isAmendment or execution blocker exists.`
