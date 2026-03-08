# Contract Clause Risk Extractor

A full-stack AI-powered tool that helps non-lawyers — project managers, commercial leads, and business owners — quickly identify and understand contractual risk without legal counsel.

---

## Project Overview

Users upload a contract PDF or paste raw text. The system runs it through a multi-step AI pipeline that extracts individual clauses, classifies them by type, scores their risk severity (High / Medium / Low), generates plain-English explanations, and produces actionable negotiation recommendations. Results are presented in a structured risk dashboard built for scanning, not reading.

---

## Architecture

The AI pipeline is deliberately decomposed into discrete stages rather than a single prompt, because a monolithic prompt produces unreliable, generic output at scale:

| Stage | What happens |
|-------|-------------|
| 1 | PDF parsed via `pdf-parse`; raw text extracted |
| 2 | Contract chunked into individual clauses using heading pattern matching |
| 3 | Metadata extracted (parties, reference, value, version) via Gemini |
| 4 | All clauses classified in one batched AI call: type, risk level, title, clause ref, inline reviewer notes, amendment flags |
| 5 | High and Medium clauses enriched in a second AI call: specific plain-English explanations and concrete recommendations |
| 6 | Executive summary generated in a third AI call: overall risk rating, top 3 issues, narrative |

The API route (`/api/analyze`) streams progress as Server-Sent Events, so the frontend advances the loading UI in real time as each stage completes — not via a fake timer.

Results are stored in a Zustand store with `persist` middleware (localStorage), eliminating SSR hydration issues and surviving page refresh.

---

## AI Model Choice

**Gemini 2.5 Flash Lite** (`gemini-2.5-flash-lite`) was chosen for its combination of speed, cost-efficiency, and strong structured output support. All three AI calls use `responseMimeType: "application/json"` with a strict `responseJsonSchema`, ensuring the model returns typed, parseable JSON without post-processing heuristics. For a production deployment, `gemini-2.5-flash` or `gemini-2.5-pro` would improve classification accuracy on ambiguous clauses.

---

## User Interface Design

The dashboard is designed around scannability over reading depth:

- **Contract header strip** — parties, reference, version, estimated value, and an overall risk badge visible immediately on load
- **Inbox-style clause list** — color-coded risk dots, clause references, titles, and type pills allow fast visual triage without opening each clause
- **Detail panel** — original clause text, plain-English explanation, and a color-coded recommendation card (red for High, amber for Medium) presented in a fixed layout with warning banners for inline amendments and reviewer notes
- **Multi-step loader** — typewriter-animated pipeline stages with real SSE-driven progress, not a spinner, so users understand the system is doing meaningful work

---

## Known Limitations

- **Chunking is heuristic** — clause splitting uses regex heading patterns and may merge or split clauses incorrectly in non-standard contract formats
- **Single-pass classification** — all clauses are classified in one batched prompt; very long contracts (20+ pages) may see quality degrade near token limits
- **No authentication** — analysis results are stored only in the browser's localStorage; there is no user account or persistent history
- **PDF quality dependent** — scanned PDFs or image-based PDFs will produce empty or garbled text since `pdf-parse` extracts text layer only
- **Draft v0.7 test contract** — the Thorngate MSA sample contains intentional reviewer annotations and amendment flags that improve demo quality; real-world contracts may produce fewer flagged issues

---

## Future Improvements

- **Streaming clause results** — surface clauses to the UI as they are classified rather than waiting for the full pipeline to complete
- **PDF export** — generate a structured risk report as a downloadable PDF
- **Clause comparison** — diff two versions of a contract to highlight what changed between drafts
- **Fine-tuned classification** — replace general-purpose prompts with a model fine-tuned on contract clause datasets for higher precision
- **User accounts + history** — persist analysis history across sessions with a database backend

---

## Tools Used

- **Claude Code** (Anthropic) — used as the primary AI coding assistant throughout development for architecture decisions, component implementation, and pipeline design
- **Next.js 16**, **TypeScript**, **Tailwind CSS v4**, **shadcn/ui**, **Zustand**, **Gemini API**, **pdf-parse**
