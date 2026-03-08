// ─── Contract Types ────────────────────────────────────────────────────────────

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

export type ClauseType =
  | "liability"
  | "payment"
  | "IP"
  | "termination"
  | "confidentiality"
  | "change_control"
  | "warranty"
  | "service_delivery"
  | "data_protection"
  | "other"

export type RiskLevel = "High" | "Medium" | "Low"

export interface ClauseAnalysis {
  id: string
  title: string
  clauseRef: string
  type: ClauseType
  risk: RiskLevel
  text: string
  explanation: string
  recommendation: string
  reviewerNote?: string
  isAmendment: boolean
}

export interface ContractSummary {
  overallRisk: RiskLevel
  topIssues: string[]
  narrative: string
  highCount: number
  mediumCount: number
  lowCount: number
}

export interface ContractAnalysis {
  meta: ContractMeta
  summary: ContractSummary
  clauses: ClauseAnalysis[]
}