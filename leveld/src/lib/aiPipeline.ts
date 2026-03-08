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
const MODEL = "gemini-2.5-flash-lite"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  return JSON.parse(stripped) as T
}

async function generate<T>(systemInstruction: string, userContent: string, schema: object): Promise<T> {
  const response = await ai.models.generateContent({
    model: MODEL,
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
  const systemInstruction = `You are a contract analyst. Extract structured metadata from the contract header/preamble.
Return null for fields you cannot find. For estimatedValue, return a number (no currency symbols). For currency, default to "GBP" if UK contract, "USD" if US.`

  const userContent = `Extract metadata from this contract (first 3000 chars):\n\n${contractText.slice(0, 3000)}`

  try {
    return await generate<ContractMeta>(systemInstruction, userContent, META_SCHEMA)
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
  type: "liability" | "payment" | "IP" | "termination" | "confidentiality" | "change control" | "other"
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
      title: { type: "string", description: "Short descriptive title for this clause (e.g. 'Liability Cap', 'Payment Terms NET-90')" },
      clauseRef: { type: "string", description: "Clause reference as it appears in the contract (e.g. 'Clause 9.2', 'Section 4.3'). Use 'Unknown' if not found." },
      type: { type: "string", enum: ["liability", "payment", "IP", "termination", "confidentiality", "change control", "other"] },
      risk: { type: "string", enum: ["High", "Medium", "Low"] },
      rationale: { type: "string", description: "One sentence explaining the risk level" },
      reviewerNote: { type: "string", nullable: true, description: "Any inline reviewer/PM note found in the clause text (e.g. '[REVIEWER NOTE: ...]'). Null if none." },
      isAmendment: { type: "boolean", description: "True if the clause contains an inline amendment or change note" },
    },
    required: ["title", "clauseRef", "type", "risk", "rationale", "reviewerNote", "isAmendment"],
  },
}

async function classifyClauses(chunks: string[]): Promise<ClassificationResult> {
  const systemInstruction = `You are a senior commercial contracts lawyer doing a first-pass risk review.

For each clause:
1. TITLE — a short, specific label (e.g. "Liability Cap", "NET-90 Payment Terms", "Broad IP Assignment")
2. CLAUSE REF — the exact clause number/reference from the text (e.g. "Clause 9.2"). Use "Preamble" or "Unknown" if none.
3. TYPE — liability | payment | IP | termination | confidentiality | change control | other
4. RISK — High / Medium / Low based on commercial impact, not just keywords
5. RATIONALE — one sentence explaining your risk decision
6. REVIEWER NOTE — copy any inline reviewer/PM/legal annotations verbatim (e.g. "[REVIEWER NOTE: ...]", "[NOTE FOR REVIEWER: ...]"). Null if none.
7. IS AMENDMENT — true if there's an inline amendment, email override, or "DO NOT EXECUTE" flag

Return exactly one object per clause in input order.`

  const userContent = chunks.map((c, i) => `--- Clause ${i + 1} ---\n${c}`).join("\n\n")
  return generate<ClassificationResult>(systemInstruction, userContent, CLASSIFICATION_SCHEMA)
}

// ─── Stage 5 — Risk Enrichment ────────────────────────────────────────────────

type EnrichmentResult = Array<{ explanation: string; recommendation: string }>

const ENRICHMENT_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      explanation: { type: "string", description: "2–3 sentence plain-English explanation of the specific risk. Reference exact terms, amounts, or language." },
      recommendation: { type: "string", description: "1–2 sentence concrete recommendation. Name specific percentages, timeframes, or wording." },
    },
    required: ["explanation", "recommendation"],
  },
}

async function enrichRiskyClauses(
  items: Array<{ index: number; text: string; title: string; type: string; risk: "High" | "Medium" | "Low"; rationale: string }>
): Promise<EnrichmentResult> {
  if (items.length === 0) return []

  const systemInstruction = `You are a senior commercial contracts lawyer advising a non-lawyer business stakeholder.

For each clause:
1. EXPLANATION — 2–3 sentences explaining EXACTLY why it's risky. Reference specific terms, amounts, or language. No generic advice.
2. RECOMMENDATION — 1–2 sentences with a concrete, actionable step. Name specific percentages, timeframes, or alternative wording.

Avoid vague language like "this may be risky" or "consider reviewing".`

  const userContent = items
    .map((item, i) => `--- Item ${i + 1} | ${item.risk} Risk | ${item.title} | Type: ${item.type} ---\nContext: ${item.rationale}\n\n${item.text}`)
    .join("\n\n")

  return generate<EnrichmentResult>(systemInstruction, userContent, ENRICHMENT_SCHEMA)
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
    topIssues: { type: "array", items: { type: "string" }, description: "Up to 3 most significant risk issues, one sentence each" },
    narrative: { type: "string", description: "2–3 sentence executive summary for a non-lawyer stakeholder" },
  },
  required: ["overallRisk", "topIssues", "narrative"],
}

async function generateSummary(clauses: ClauseAnalysis[]): Promise<SummaryResult> {
  const high = clauses.filter((c) => c.risk === "High")
  const med = clauses.filter((c) => c.risk === "Medium")

  const systemInstruction = `You are a senior commercial contracts lawyer writing an executive risk summary for a non-lawyer business decision-maker.
Assign an OVERALL risk rating, list the TOP 3 most significant issues (specific and actionable), and write a 2–3 sentence NARRATIVE.
Be direct. No generic disclaimers.`

  const userContent = `Contract Risk Breakdown:
- High risk clauses: ${high.length}
- Medium risk clauses: ${med.length}
- Low risk clauses: ${clauses.filter((c) => c.risk === "Low").length}
- Total: ${clauses.length}

High Risk:
${high.map((c, i) => `${i + 1}. [${c.clauseRef}] ${c.title}: ${c.explanation}`).join("\n") || "None"}

Medium Risk:
${med.map((c, i) => `${i + 1}. [${c.clauseRef}] ${c.title}: ${c.explanation}`).join("\n") || "None"}`

  return generate<SummaryResult>(systemInstruction, userContent, SUMMARY_SCHEMA)
}

// ─── Pipeline Orchestrator ────────────────────────────────────────────────────

export type StageCallback = (stage: number, label: string) => void

export async function runAiPipeline(
  chunks: string[],
  fullText: string,
  onStage: StageCallback = () => {}
): Promise<ContractAnalysis> {
  // Stage 3: Extract contract metadata
  onStage(3, "Extracting contract metadata")
  const meta = await extractMetadata(fullText)

  // Stage 4: Classify all clauses
  onStage(4, "Classifying clauses & scoring risk")
  const classifications = await classifyClauses(chunks)
  const safeCls = chunks.map((_, i) => classifications[i] ?? {
    title: "Unclassified Clause",
    clauseRef: "Unknown",
    type: "other" as const,
    risk: "Low" as const,
    rationale: "Unclassified clause.",
    reviewerNote: null,
    isAmendment: false,
  })

  // Stage 5: Enrich High and Medium clauses
  onStage(5, "Enriching high & medium risk findings")
  const toEnrich = safeCls
    .map((cls, i) => ({ index: i, text: chunks[i], title: cls.title, type: cls.type, risk: cls.risk, rationale: cls.rationale }))
    .filter((item) => item.risk === "High" || item.risk === "Medium")

  const enriched = await enrichRiskyClauses(toEnrich)
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
      explanation: enrichment?.explanation ?? cls.rationale ?? "This clause presents low commercial risk.",
      recommendation: enrichment?.recommendation ?? "No immediate action required.",
      reviewerNote: cls.reviewerNote ?? undefined,
      isAmendment: cls.isAmendment ?? false,
    }
  })

  // Stage 6: Generate summary
  onStage(6, "Generating executive summary")
  const summaryResult = await generateSummary(clauses)

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
