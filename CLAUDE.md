# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

The repository contains:
- `leveld/` — the Next.js application (all development happens here)
- `docs/` — challenge brief PDFs (leveld_challenge_brief_v2.pdf, thorngate_msa_draft.pdf)

All commands must be run from `leveld/`.

## Commands

```bash
pnpm dev        # Start dev server at http://localhost:3000
pnpm build      # Production build (also type-checks)
pnpm lint       # Run ESLint
```

No tests are configured.

## Tech Stack

- **Next.js 16** — App Router, React Server Components enabled
- **React 19** / **TypeScript** (strict, `@/*` → `src/*`)
- **Tailwind CSS v4** with CSS variables for theming (`src/app/globals.css`)
- **shadcn/ui** (radix-nova style, lucide icons) — add components via `pnpm dlx shadcn add <component>`, goes in `src/components/ui/`
- **@google/genai** — Gemini AI SDK (`gemini-2.5-flash-lite` model)
- **Zustand 5** with `persist` middleware — global state, persists to localStorage
- **pdf-parse** — PDF text extraction (server-side only)

## Architecture

### Data Flow

```
Upload page (page.tsx)
  → POST /api/analyze (SSE stream)
    → parsePdf / raw text
    → chunkContract (splits into clause chunks)
    → runAiPipeline(chunks, fullText, onStage)
      Stage 3: extractMetadata   → ContractMeta
      Stage 4: classifyClauses   → title, clauseRef, type, risk, reviewerNote, isAmendment
      Stage 5: enrichRiskyClauses → explanation, recommendation (High/Medium only)
      Stage 6: generateSummary   → overallRisk, topIssues, narrative
  → fires SSE events: { type:"stage"|"done"|"error", ... }
  → client reads stream, advances AnalysisLoader stages in real time
  → on "done": saves ContractAnalysis to Zustand store → redirect to /dashboard
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | All shared types: `ContractAnalysis`, `ContractMeta`, `ClauseAnalysis`, `PipelineEvent` |
| `src/lib/store.ts` | Zustand store with `persist` — holds `analysis`, `setAnalysis`, `clearAnalysis` |
| `src/lib/aiPipeline.ts` | All Gemini AI calls — 3 batched calls with JSON schema enforcement |
| `src/lib/chunkContract.ts` | Splits contract text into clause chunks by heading patterns |
| `src/lib/parsePdf.ts` | Extracts text from PDF buffer using pdf-parse |
| `src/app/api/analyze/route.ts` | SSE streaming POST endpoint — fires stage events as pipeline progresses |
| `src/components/analysis-loader.tsx` | Multi-step typewriter loader — driven by `currentStage` prop (1–7) |
| `src/components/app-sidebar.tsx` | App sidebar with nav links, uses `usePathname` for active state |

### ContractAnalysis Shape

```ts
{
  meta: { title, supplier, client, reference, version, effectiveDate, estimatedValue, currency }
  summary: { overallRisk, topIssues, narrative, highCount, mediumCount, lowCount }
  clauses: [{
    id, title, clauseRef, type, risk, text,
    explanation, recommendation, reviewerNote?, isAmendment?
  }]
}
```

### SSE Protocol

The `/api/analyze` endpoint streams newline-delimited `data: {json}\n\n` events:
- `{ type: "stage", stage: number, label: string }` — fired at each pipeline stage (1–6)
- `{ type: "done", result: ContractAnalysis }` — final payload
- `{ type: "error", message: string }` — on failure

Client parses these in `page.tsx` by reading the `ReadableStream` chunk by chunk, splitting on `\n`, and filtering lines starting with `data: `.

### State Management

Zustand store (`src/lib/store.ts`) is the single source of truth for analysis results. The upload page calls `setAnalysis(result)` after SSE completes; the dashboard reads `useAnalysisStore((s) => s.analysis)`. State persists to localStorage under the key `"contract-analysis"`.

### Dashboard Layout

Inbox-style split panel:
- **Header strip** — contract meta, overall risk badge, counts, narrative, top issues
- **Left sidebar** — scrollable clause list with risk dot, clauseRef, title, type pill, risk badge, AMENDED/NOTE flags
- **Right detail panel** — sticky header with warning banners (amendment/reviewer note), original text blockquote, "Why Risky" explanation, color-coded recommendation card
- **Mobile** — full-width list → tap → detail push pattern via `mobileDetail` state

## Key Conventions

- `cn()` from `@/lib/utils` for all conditional class merging
- All AI calls use `responseMimeType: "application/json"` + `responseJsonSchema` for structured output — no prompt parsing hacks
- `pdf-parse` and all AI calls are server-side only (API route / lib files without `"use client"`)
- The dashboard reads from Zustand (not sessionStorage) to avoid SSR hydration mismatches
- Gemini model constant `MODEL = "gemini-2.5-flash-lite"` is in `aiPipeline.ts`
- Requires `GEMINI_API_KEY` in `.env.local`
