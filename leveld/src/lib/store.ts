import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ContractAnalysis } from "@/lib/types"

interface AnalysisStore {
  analysis: ContractAnalysis | null
  setAnalysis: (analysis: ContractAnalysis) => void
  clearAnalysis: () => void
}

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set) => ({
      analysis: null,
      setAnalysis: (analysis) => set({ analysis }),
      clearAnalysis: () => set({ analysis: null }),
    }),
    { name: "contract-analysis" }
  )
)
