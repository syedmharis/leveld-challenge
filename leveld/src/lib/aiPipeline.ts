/**
 * AI Analysis Pipeline — Contract Clause Risk Extractor
 *
 * Stages:
 *  1. Contract Parsing      — handled upstream (parsePdf / raw text)
 *  2. Clause Chunking       — handled upstream (chunkContract)
 *  3. Metadata Extraction   — title, parties, ref, value from contract header
 *  4. Clause Classification — classify each chunk: type, risk, title, ref, reviewer notes
 *  5. Risk Enrichment       — plain-English explanation + recommendation for High/Medium
 *  6. Contract Summary      — overall risk narrative + top issues
 */

import { GoogleGenAI } from "@google/genai"
import type { ClauseAnalysis, ContractAnalysis, ContractMeta } from "@/lib/types"

export type { ClauseAnalysis, ContractAnalysis }

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const FAST_MODEL = "gemini-2.5-flash-lite"    // cheap: metadata, classification
const SMART_MODEL = "gemini-2.5-flash"         // reasoning: enrichment, summary

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  return JSON.parse(stripped) as T
}

async function generate<T>(
  model: string,
  systemInstruction: string,
  userContent: string,
  schema: object
): Promise<T> {
  const response = await ai.models.generateContent({
    model,
    contents: userContent,
    config: { systemInstruction, responseMimeType: "application/json", responseJsonSchema: schema },
  })
  return parseJson<T>(response.text ?? "")
}

// ─── Stage 3 — Metadata Extraction ───────────────────────────────────────────

const META_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    supplier: { type: "string" },
    client: { type: "string" },
    reference: { type: "string" },
    version: { type: "string" },
    effectiveDate: { type: "string", nullable: true },
    estimatedValue: { type: "number", nullable: true },
    currency: { type: "string" },
  },
  required: ["title", "supplier", "client", "reference", "version", "effectiveDate", "estimatedValue", "currency"],
}

async function extractMetadata(contractText: string): Promise<ContractMeta> {
  const systemInstruction = `You are a contract analyst. Extract structured metadata from the contract.

IMPORTANT for estimatedValue:
- Look at fee schedules, annexes, total contract value, and any retainer/ongoing costs.
- If there's a fixed price total PLUS a monthly retainer, ADD them together for the full-term value.
  Example: £240,000 fixed + £6,500/month × 12 months = £240,000 + £78,000 = £318,000 minimum.
- If the contract says "estimated at £[TBC]" but fee schedules show actual numbers, use the actual numbers.
- Return a number (no currency symbols). Return null only if truly no financial information exists.
- For currency, default to "GBP" if UK contract, "USD" if US.`

  // Send more text to capture annexes with fee data
  const userContent = `Extract metadata from this contract:\n\n${contractText.slice(0, 6000)}`

  try {
    return await generate<ContractMeta>(FAST_MODEL, systemInstruction, userContent, META_SCHEMA)
  } catch {
    return {
      title: "Contract Agreement",
      supplier: "Unknown",
      client: "Unknown",
      reference: "N/A",
      version: "N/A",
      effectiveDate: null,
      estimatedValue: null,
      currency: "GBP",
    }
  }
}

// ─── Stage 4 — Clause Classification ─────────────────────────────────────────

type ClassificationResult = Array<{
  title: string
  clauseRef: string
  type: "liability" | "payment" | "IP" | "termination" | "confidentiality" | "change_control" | "warranty" | "service_delivery" | "data_protection" | "other"
  risk: "High" | "Medium" | "Low"
  rationale: string
  reviewerNote: string | null
  isAmendment: boolean
}>

const CLASSIFICATION_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short descriptive title (e.g. 'Liability Cap', 'NET-90 Payment Terms', 'Broad IP Assignment')" },
      clauseRef: { type: "string", description: "Clause reference from the text (e.g. 'Clause 9.2'). Use 'Preamble' if none." },
      type: {
        type: "string",
        enum: ["liability", "payment", "IP", "termination", "confidentiality", "change_control", "warranty", "service_delivery", "data_protection", "other"],
      },
      risk: { type: "string", enum: ["High", "Medium", "Low"] },
      rationale: { type: "string", description: "One sentence explaining the risk level — reference specific amounts, timeframes, or language" },
      reviewerNote: { type: "string", nullable: true, description: "Any inline reviewer/PM/legal note found verbatim. Null if none." },
      isAmendment: { type: "boolean", description: "True if clause contains inline amendment, email override, or 'DO NOT EXECUTE' flag" },
    },
    required: ["title", "clauseRef", "type", "risk", "rationale", "reviewerNote", "isAmendment"],
  },
}

function buildClassificationPrompt(meta: ContractMeta): string {
  const valueContext = meta.estimatedValue
    ? `\n\nCONTRACT CONTEXT: Estimated total value is ${meta.currency} ${meta.estimatedValue.toLocaleString()}. Use this to assess PROPORTIONALITY of caps, fees, and penalties. A £15,000 liability cap on a £480,000 contract is ~3% — that is HIGH risk.`
    : ""

  return `You are a senior commercial contracts lawyer doing a first-pass risk review.

READ THE ACTUAL TEXT of each clause carefully. The text IS the clause — analyze what it says, not just its heading.

For each clause chunk provided:
1. TITLE — short, specific label based on the CONTENT (e.g. "Liability Cap at £15k", "One-Sided Termination for Convenience")
2. CLAUSE REF — the exact clause number from the text. If a chunk covers multiple sub-clauses, use the parent (e.g. "Clause 9" not "Clause 9.1-9.4")
3. TYPE — classify based on content: liability | payment | IP | termination | confidentiality | change_control | warranty | service_delivery | data_protection | other
4. RISK — High / Medium / Low based on COMMERCIAL IMPACT, not keywords:
   - HIGH: Disproportionate liability caps relative to contract value, one-sided termination rights, IP grabs extending beyond project scope, unresolved amendments blocking execution
   - MEDIUM: Tight cure periods, auto-renewal traps, no set-off rights, subcontracting without consent, broad warranty exclusions
   - LOW: Standard boilerplate, mutual obligations, reasonable confidentiality terms
5. RATIONALE — one sentence with specific details (amounts, timeframes, exact problematic language)
6. REVIEWER NOTE — copy ANY inline annotations verbatim: "[REVIEWER NOTE: ...]", "[NOTE FOR REVIEWER: ...]", "[AMENDMENT — ...]", "DO NOT EXECUTE", "[TBC]"
7. IS AMENDMENT — true if there's an inline amendment, email reference changing terms, or execution blocker

CRITICAL: Each chunk may contain MULTIPLE sub-clauses. Analyze the ENTIRE chunk as one unit. Match your clauseRef to what's actually in the text.
Also flag cross-reference errors (e.g. references to clauses that don't exist).${valueContext}

Return exactly one object per clause chunk, in input order.`
}

async function classifyClauses(chunks: string[], meta: ContractMeta): Promise<ClassificationResult> {
  const systemInstruction = buildClassificationPrompt(meta)
  const userContent = chunks.map((c, i) => `\n=== CHUNK ${i + 1} of ${chunks.length} ===\n${c}`).join("\n\n")
  return generate<ClassificationResult>(FAST_MODEL, systemInstruction, userContent, CLASSIFICATION_SCHEMA)
}

// ─── Stage 5 — Risk Enrichment ────────────────────────────────────────────────

type EnrichmentResult = Array<{ explanation: string; recommendation: string }>

const ENRICHMENT_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      explanation: {
        type: "string",
        description: "2-3 sentence plain-English explanation. Reference exact terms, amounts, timeframes, or problematic language from the clause.",
      },
      recommendation: {
        type: "string",
        description: "1-2 sentence concrete, actionable recommendation. Name specific percentages, timeframes, or alternative wording to negotiate.",
      },
    },
    required: ["explanation", "recommendation"],
  },
}

async function enrichRiskyClauses(
  items: Array<{
    index: number
    text: string
    title: string
    type: string
    risk: "High" | "Medium" | "Low"
    rationale: string
  }>,
  meta: ContractMeta
): Promise<EnrichmentResult> {
  if (items.length === 0) return []

  const valueContext = meta.estimatedValue
    ? `The total contract value is approximately ${meta.currency} ${meta.estimatedValue.toLocaleString()}.`
    : "The total contract value is not specified."

  const systemInstruction = `You are a senior commercial contracts lawyer advising a busy, non-lawyer project manager.
${valueContext}

For each clause:
1. EXPLANATION — 2-3 sentences explaining EXACTLY why it's risky in plain English. A non-lawyer must understand:
   - What the clause actually says (in simple terms)
   - Why it hurts them specifically (reference amounts, proportions, timeframes)
   - What could go wrong in practice (concrete scenario)

2. RECOMMENDATION — 1-2 sentences with a SPECIFIC, actionable step. Bad: "Consider reviewing this clause." Good: "Negotiate the liability cap to at least 100% of total fees paid (£318,000), and add carve-outs for IP infringement and data breaches."

Do NOT use vague language. Every explanation must reference specific contract terms. Every recommendation must include a number, timeframe, or exact wording change.`

  const userContent = items
    .map(
      (item, i) =>
        `--- Item ${i + 1} | ${item.risk} Risk | ${item.title} | Type: ${item.type} ---\nInitial assessment: ${item.rationale}\n\nFULL CLAUSE TEXT:\n${item.text}`
    )
    .join("\n\n")

  return generate<EnrichmentResult>(SMART_MODEL, systemInstruction, userContent, ENRICHMENT_SCHEMA)
}

// ─── Stage 6 — Contract Summary ───────────────────────────────────────────────

type SummaryResult = {
  overallRisk: "High" | "Medium" | "Low"
  topIssues: string[]
  narrative: string
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overallRisk: { type: "string", enum: ["High", "Medium", "Low"] },
    topIssues: { type: "array", items: { type: "string" }, description: "Top 3 most critical risk issues, one specific sentence each" },
    narrative: { type: "string", description: "2-3 sentence executive summary for a non-lawyer decision-maker" },
  },
  required: ["overallRisk", "topIssues", "narrative"],
}

async function generateSummary(clauses: ClauseAnalysis[], meta: ContractMeta): Promise<SummaryResult> {
  const high = clauses.filter((c) => c.risk === "High")
  const med = clauses.filter((c) => c.risk === "Medium")
  const low = clauses.filter((c) => c.risk === "Low")

  const valueContext = meta.estimatedValue
    ? `Contract value: ~${meta.currency} ${meta.estimatedValue.toLocaleString()}.`
    : ""

  const systemInstruction = `You are a senior commercial contracts lawyer writing a 30-second executive risk briefing.
${valueContext}

Rules:
- Overall risk = High if ANY clause is High risk, Medium if no High but multiple Medium, Low otherwise.
- Top 3 issues must be specific and actionable — name clause refs, amounts, and consequences.
- Narrative is 2-3 sentences for a CEO who will spend 15 seconds reading it. No legal jargon. No generic disclaimers.
- If there are unresolved amendments or "DO NOT EXECUTE" flags, mention this prominently.`

  const userContent = `Contract: ${meta.title} | ${meta.supplier} ↔ ${meta.client} | Ref: ${meta.reference}

Risk Breakdown: ${high.length} High | ${med.length} Medium | ${low.length} Low | ${clauses.length} Total

High Risk Clauses:
${high.map((c, i) => `${i + 1}. [${c.clauseRef}] ${c.title} — ${c.explanation}`).join("\n") || "None"}

Medium Risk Clauses:
${med.map((c, i) => `${i + 1}. [${c.clauseRef}] ${c.title} — ${c.explanation}`).join("\n") || "None"}`

  return generate<SummaryResult>(SMART_MODEL, systemInstruction, userContent, SUMMARY_SCHEMA)
}

// ─── Pipeline Orchestrator ────────────────────────────────────────────────────

export type StageCallback = (stage: number, label: string) => void

export async function runAiPipeline(
  chunks: string[],
  fullText: string,
  onStage: StageCallback = () => {}
): Promise<ContractAnalysis> {
  // Stage 3: Extract contract metadata (includes estimated value for proportional scoring)
  onStage(3, "Extracting contract metadata")
  const meta = await extractMetadata(fullText)

  // Stage 4: Classify all clauses (pass meta for value-aware risk scoring)
  onStage(4, "Classifying clauses & scoring risk")
  const classifications = await classifyClauses(chunks, meta)

  const safeCls = chunks.map((_, i) =>
    classifications[i] ?? {
      title: "Unclassified Clause",
      clauseRef: "Unknown",
      type: "other" as const,
      risk: "Low" as const,
      rationale: "Could not classify this clause.",
      reviewerNote: null,
      isAmendment: false,
    }
  )

  // Stage 5: Enrich High and Medium clauses with detailed explanations
  onStage(5, "Generating risk explanations & recommendations")
  const toEnrich = safeCls
    .map((cls, i) => ({
      index: i,
      text: chunks[i],
      title: cls.title,
      type: cls.type,
      risk: cls.risk,
      rationale: cls.rationale,
    }))
    .filter((item) => item.risk === "High" || item.risk === "Medium")

  const enriched = await enrichRiskyClauses(toEnrich, meta)
  const enrichMap = new Map(toEnrich.map((item, ei) => [item.index, enriched[ei]]))

  // Assemble clause results
  const clauses: ClauseAnalysis[] = chunks.map((text, i) => {
    const cls = safeCls[i]
    const enrichment = enrichMap.get(i)
    return {
      id: `clause-${i + 1}`,
      title: cls.title,
      clauseRef: cls.clauseRef,
      type: cls.type,
      risk: cls.risk,
      text,
      explanation: enrichment?.explanation ?? cls.rationale,
      recommendation: enrichment?.recommendation ?? "No immediate action required.",
      reviewerNote: cls.reviewerNote ?? undefined,
      isAmendment: cls.isAmendment ?? false,
    }
  })

  // Stage 6: Generate executive summary
  onStage(6, "Generating executive summary")
  const summaryResult = await generateSummary(clauses, meta)

  return {
    meta,
    summary: {
      ...summaryResult,
      highCount: clauses.filter((c) => c.risk === "High").length,
      mediumCount: clauses.filter((c) => c.risk === "Medium").length,
      lowCount: clauses.filter((c) => c.risk === "Low").length,
    },
    clauses,
  }
}