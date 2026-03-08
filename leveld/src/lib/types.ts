export interface ClauseAnalysis {
  id: string
  title: string
  clauseRef: string
  type: "liability" | "payment" | "IP" | "termination" | "confidentiality" | "change control" | "other"
  risk: "High" | "Medium" | "Low"
  text: string
  explanation: string
  recommendation: string
  reviewerNote?: string
  isAmendment?: boolean
}

export interface ContractMeta {
  title: string
  supplier: string
  client: string
  reference: string
  version: string
  effectiveDate: string | null
  estimatedValue: number | null
  currency: string
}

export interface ContractAnalysis {
  meta: ContractMeta
  summary: {
    overallRisk: "High" | "Medium" | "Low"
    topIssues: string[]
    narrative: string
    highCount: number
    mediumCount: number
    lowCount: number
  }
  clauses: ClauseAnalysis[]
}

// SSE event types for streaming progress
export type PipelineEvent =
  | { type: "stage"; stage: number; label: string }
  | { type: "done"; result: ContractAnalysis }
  | { type: "error"; message: string }
