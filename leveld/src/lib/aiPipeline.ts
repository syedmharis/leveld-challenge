/**
 * AI Analysis Pipeline — Contract Clause Risk Extractor
 *
 * Stages:
 *  1. Contract Parsing    — handled upstream (parsePdf / raw text)
 *  2. Clause Chunking     — handled upstream (chunkContract)
 *  3. Metadata Extraction — title, parties, ref, value (scans full text incl. annexes)
 *  4. Clause Analysis     — classify + score + explain in one pass
 *                           Boilerplate chunks (Background, Execution, etc.) are tagged
 *                           [BOILERPLATE] so the model returns fast Low-risk defaults
 *                           rather than spending tokens on deep analysis.
 *  5. Contract Summary    — overall risk narrative + top issues
 */

import Groq from "groq-sdk"
import type { ClauseAnalysis, ContractAnalysis, ContractMeta, PipelineDebug } from "@/lib/types"
import { META_SYSTEM, buildClauseSystemPrompt, SUMMARY_SYSTEM } from "@/lib/prompts"
import { isBoilerplateChunk } from "@/lib/chunkContract"

export type { ClauseAnalysis, ContractAnalysis }

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

// moonshotai/kimi-k2-instruct-0905 — fast classification (supports prompt caching)
// openai/gpt-oss-120b              — strict structured outputs, summary (supports prompt caching)
const FAST_MODEL = "moonshotai/kimi-k2-instruct-0905"
// const FAST_MODEL = "openai/gpt-oss-20b" 
const SMART_MODEL = "openai/gpt-oss-120b"

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generate<T>(
  model: string,
  systemInstruction: string,
  userContent: string,
  schema: Record<string, unknown>,
  schemaName: string,
  strict = false
): Promise<T> {
  const response = await groq.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, strict, schema },
    },
    temperature: 0,
  })
  const content = response.choices[0]?.message?.content ?? "{}"
  return JSON.parse(content) as T
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
    effectiveDate: { type: ["string", "null"] },
    estimatedValue: { type: ["number", "null"] },
    currency: { type: "string" },
  },
  required: ["title", "supplier", "client", "reference", "version", "effectiveDate", "estimatedValue", "currency"],
}

async function extractMetadata(contractText: string): Promise<ContractMeta> {
  try {
    // Pass the full contract text so fee schedules and annexes at the end are included
    return await generate<ContractMeta>(
      FAST_MODEL,
      META_SYSTEM,
      contractText,
      META_SCHEMA,
      "contract_metadata"
    )
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

// ─── Stage 4 — Clause Analysis (classify + score + explain in one pass) ───────

type ClauseAnalysisResult = Array<{
  title: string
  clauseRef: string
  type: "liability" | "payment" | "IP" | "termination" | "confidentiality" | "change_control" | "warranty" | "service_delivery" | "data_protection" | "other"
  risk: "High" | "Medium" | "Low"
  explanation: string
  recommendation: string
  reviewerNote: string | null
  isAmendment: boolean
}>

const CLAUSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      clauseRef: { type: "string" },
      type: {
        type: "string",
        enum: ["liability", "payment", "IP", "termination", "confidentiality", "change_control", "warranty", "service_delivery", "data_protection", "other"],
      },
      risk: { type: "string", enum: ["High", "Medium", "Low"] },
      explanation: { type: "string" },
      recommendation: { type: "string" },
      reviewerNote: { type: ["string", "null"] },
      isAmendment: { type: "boolean" },
    },
    required: ["title", "clauseRef", "type", "risk", "explanation", "recommendation", "reviewerNote", "isAmendment"],
  },
}

/**
 * Tag boilerplate chunks with a [BOILERPLATE] prefix so the model returns
 * fast Low-risk defaults instead of spending full analysis tokens on them.
 * This reduces input tokens by ~15-20% on typical contracts.
 */
function tagChunks(chunks: string[]): string[] {
  return chunks.map((c) => (isBoilerplateChunk(c) ? `[BOILERPLATE]\n${c}` : c))
}

async function analyzeClauses(chunks: string[], meta: ContractMeta): Promise<ClauseAnalysisResult> {
  const systemInstruction = buildClauseSystemPrompt(meta)
  const tagged = tagChunks(chunks)
  const userContent =
    `You MUST return EXACTLY ${tagged.length} JSON objects in the array — one per chunk in order. Do not skip any chunk.\n\n` +
    tagged.map((c, i) => `=== CHUNK ${i + 1}/${tagged.length} ===\n${c}`).join("\n\n")

  const result = await generate<ClauseAnalysisResult>(
    FAST_MODEL, systemInstruction, userContent, CLAUSE_SCHEMA, "clause_analysis"
  )

  // If count matches, we're done
  if (result.length === chunks.length) return result

  // Model returned fewer objects — retry ONLY the missing indices individually (in parallel)
  const missingIndexes = Array.from({ length: chunks.length }, (_, i) => i).filter((i) => !result[i])

  if (missingIndexes.length === 0) return result

  const retryResults = await Promise.all(
    missingIndexes.map(async (i) => {
      const retryContent =
        `Classify this single chunk. Return exactly 1 object.\n\n=== CHUNK ${i + 1}/${chunks.length} ===\n${tagged[i]}`
      try {
        const res = await generate<ClauseAnalysisResult>(
          FAST_MODEL, systemInstruction, retryContent, CLAUSE_SCHEMA, "clause_analysis_retry"
        )
        return { i, result: res[0] ?? null }
      } catch {
        return { i, result: null }
      }
    })
  )

  const merged = [...result]
  for (const { i, result: r } of retryResults) {
    if (r) merged[i] = r
  }

  return merged
}

// ─── Stage 5 — Contract Summary ───────────────────────────────────────────────

type SummaryResult = {
  overallRisk: "High" | "Medium" | "Low"
  topIssues: string[]
  narrative: string
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overallRisk: { type: "string", enum: ["High", "Medium", "Low"] },
    topIssues: { type: "array", items: { type: "string" } },
    narrative: { type: "string" },
  },
  required: ["overallRisk", "topIssues", "narrative"],
  additionalProperties: false,
}

async function generateSummary(clauses: ClauseAnalysis[], meta: ContractMeta): Promise<SummaryResult> {
  const high = clauses.filter((c) => c.risk === "High")
  const med = clauses.filter((c) => c.risk === "Medium")

  const valueCtx = meta.estimatedValue
    ? `Value: ${meta.currency} ${meta.estimatedValue.toLocaleString()}.`
    : ""

  const blockers = clauses.filter((c) => c.isAmendment || (c.reviewerNote?.toUpperCase().includes("DO NOT EXECUTE")))
  const blockerFlag = blockers.length > 0
    ? `EXECUTION BLOCKERS (DO NOT EXECUTE): ${blockers.map((c) => `[${c.clauseRef}] ${c.reviewerNote ?? c.title}`).join("; ")}\n\n`
    : ""

  // Only send High + Medium clauses to the summary model — Low clauses add tokens with no value
  const userContent = `${meta.title} | ${meta.supplier} ↔ ${meta.client} | ${meta.reference} | ${valueCtx}
Risk: ${high.length} High | ${med.length} Medium | ${clauses.filter((c) => c.risk === "Low").length} Low | ${clauses.length} total

${blockerFlag}HIGH:
${high.map((c, i) => `${i + 1}. [${c.clauseRef}] ${c.title} — ${c.explanation}`).join("\n") || "None"}

MEDIUM:
${med.map((c, i) => `${i + 1}. [${c.clauseRef}] ${c.title} — ${c.explanation}`).join("\n") || "None"}`

  return generate<SummaryResult>(SMART_MODEL, SUMMARY_SYSTEM, userContent, SUMMARY_SCHEMA, "contract_summary", true)
}

// ─── Pipeline Orchestrator ────────────────────────────────────────────────────

export type StageCallback = (stage: number, label: string) => void

export async function runAiPipeline(
  chunks: string[],
  fullText: string,
  onStage: StageCallback = () => {}
): Promise<ContractAnalysis> {
  onStage(3, "Extracting contract metadata")
  const meta = await extractMetadata(fullText)

  onStage(4, "Analysing clauses — risk scoring & explanations")
  const clauseOutput = await analyzeClauses(chunks, meta)

  const clauses: ClauseAnalysis[] = chunks.map((text, i) => {
    const result = clauseOutput[i] ?? {
      title: "Unclassified Clause",
      clauseRef: "Unknown",
      type: "other" as const,
      risk: "Low" as const,
      explanation: "Could not classify this clause.",
      recommendation: "No action required.",
      reviewerNote: null,
      isAmendment: false,
    }
    return {
      id: `clause-${i + 1}`,
      title: result.title,
      clauseRef: result.clauseRef,
      type: result.type,
      risk: result.risk,
      text,
      explanation: result.explanation,
      recommendation: result.recommendation,
      reviewerNote: result.reviewerNote ?? undefined,
      isAmendment: result.isAmendment ?? false,
    }
  })

  onStage(5, "Generating executive summary")
  const summaryOutput = await generateSummary(clauses, meta)

  const debug: PipelineDebug = {
    rawText: fullText,
    rawChunks: chunks,
    metaOutput: meta,
    clauseOutput,
    summaryOutput,
  }

  return {
    meta,
    summary: {
      ...summaryOutput,
      highCount: clauses.filter((c) => c.risk === "High").length,
      mediumCount: clauses.filter((c) => c.risk === "Medium").length,
      lowCount: clauses.filter((c) => c.risk === "Low").length,
    },
    clauses,
    debug,
  }
}
