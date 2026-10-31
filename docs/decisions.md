# Tribe — Decision Log

Status: **Draft** (decisions D-001 to D-003 were selected by the user in-session on 2026-10-29; whole log becomes **Final** only on explicit user acceptance)
Last updated: 2026-10-29
Entry point: [../CONTINUE.md](../CONTINUE.md) · Plan: [plan.md](plan.md) · Vision: [../tribe.md](../tribe.md)

How to use: append new decisions, never silently rewrite a Decided item. To change one, add a superseding entry and mark the old one Superseded.

---

## D-001 — Track and theme: Indie developer + Build for Your World

- Status: Decided (user-selected, 2026-10-29)
- Options considered: Indie vs Startup track; *Build for Your World* vs *Push the Frontier* theme
- Decision: **Indie developer** track, **Build for Your World** theme
- Why: Tribe is a personal/team knowledge tool solving a problem the builder knows firsthand (rebuilding context across AI tools). Indie judging (creativity, technical ambition, whether it works) rewards a polished demo over production hardening. Startup track judging (production readiness) would demand auth, tenancy, and ops we cannot credibly show in ~6 days.
- Consequences: Optimise for one flawless 2-minute demo flow; README roadmap carries the production story instead of building it.

## D-002 — Demo story: engineering team incident investigation

- Status: Decided (user-selected, 2026-10-29)
- Options considered: Engineering team / Research investigation / Personal second brain
- Decision: **Engineering team** — seeded production incident (working example: checkout latency regression with runbook, root cause, and one stale/contradicting memory)
- Why: Engineering knowledge is the richest section of the vision (incidents, runbooks, architecture decisions) and makes provenance, citations, staleness, and contradiction handling visible in one story. Judges can verify "grounded vs hallucinated" instantly.
- Consequences: Seed data, UI labels, and demo script use engineering vocabulary (incident, runbook, deploy). Personal-brain framing is deferred to roadmap.

## D-003 — Build shape: Web app + MCP server, one shared store

- Status: Decided (user-selected, 2026-10-29)
- Options considered: Web app only / CLI-MCP first / Web app + MCP
- Decision: **Web app + MCP** over the same data store
- Why: Web app gives judges a visual demo; MCP proves the core thesis (context bus — another AI resumes your work) live, which a web-only demo can only claim. CLI-first would demo poorly to non-technical judging.
- Consequences: Two surfaces to build; MCP surface kept minimal (two tools). Cut order protects MCP pull (D-007).

## D-004 — MVP scope: thin vertical slice of tribe.md

- Status: Decided (proposed in plan, 2026-10-29; pending user `go`)
- In: Memory Engine core (provenance, confidence, last-verified, versions, links, supersede/deprecate, contradiction/duplicate flags), Context Sessions, Context Compiler brief, Grounded Ask with citations + explicit "I don't know", MCP push/pull, regex secret scrubbing, incident seed data
- Out (roadmap only): Slack/GitHub/browser/IDE ingestion, real-time collaboration, team permissions/workspaces, image/SAM features, full MemoryRank learning loop, mobile
- Why: All 20 sections of [../tribe.md](../tribe.md) cannot be built in ~6 days. The slice above still demonstrates all four vision pillars: Memory Engine, Context Sessions, Collaborative Sessions (via MCP), Context Compiler.
- Consequences: Any new feature idea during build goes to README roadmap unless user explicitly re-scopes.

## D-005 — LLM access: Meta Model API behind provider abstraction + offline stub

- Status: Decided (proposed in plan, 2026-10-29; pending user `go`)
- Decision: All LLM calls through one `llm` module targeting Meta Model API (Muse Spark / Muse Wonder class models per event page). Deterministic offline stub behind the same interface. Real Meta endpoint default when key present.
- Why: Hackathon requires building with Meta models, but key availability/timing in this workspace is unconfirmed. Abstraction lets build/demo proceed and makes the real-model swap a config change, not a rewrite.
- Consequences: Demo video must show a real Meta-backed run before submission; stub-only submission is a known risk to retire early. Exact endpoint/model IDs to be recorded here once keys are issued.

## D-006 — Storage and deployment: local-first, single repo, zero external services

- Status: Decided (proposed in plan, 2026-10-29; pending user `go`)
- Decision: One repo containing web app + MCP server + shared local store (file/SQLite-class). No hosted DB, auth service, or queue required to run.
- Why: Judges run it locally; every external dependency is a demo-failure mode. Local-first also matches "personal-first, collaboration when needed" principle in [../tribe.md](../tribe.md).
- Consequences: Multi-user/production deployment story lives in roadmap. Framework choice deferred to implementation (favour least local setup).

## D-007 — Cut order under time pressure

- Status: Decided (proposed in plan, 2026-10-29; pending user `go`)
- Order: 1) feedback signals 2) version-history UI (keep underlying data) 3) MCP push (keep MCP pull)
- Never cut: grounded citations, explicit "I don't know" path, compiled brief, seed reset
- Why: Citations + "I don't know" are the differentiator ("AI should explain with evidence, not hallucinate"). Everything else is compressible.

## D-008 — Individual-first: tribal knowledge owned by one person (NOT team memory)

- Status: Decided (user-stated, 2026-10-29)
- Decision: Tribe starts with an **individual user**. They store whatever they want without worrying where/how it is stored, then use it anywhere (IDE, browser, CLI, MCP, etc.). Sharing with AI agents or other users is the owner's later choice. Goal: **reduce the individual's cognitive load**.
- Why: Team/org-first dies on cold start, permissions, wiki comparisons. Tribal knowledge lives in one person's head/terminal first. Individual value must work day one, solo.
- Consequences: Demo protagonist is one engineer, not a team KB. "Personal-first, collaboration when needed" is headline, not footnote. Amends D-002 framing (engineering story kept, owner is an individual).

## D-009 — Sharing = compile → share slice → fork (Slack ask, new joiner are examples)

- Status: Decided (user-stated, 2026-10-29)
- Decision: Owner finds memories, optionally compiles to short snippet/runbook/list of steps, shares slice to one asker or whole team (e.g. Slack). Recipient **forks** into their own Tribe and adapts. New-joiner session sharing is one instance of this, not the whole feature.
- Why: Sharing as deliberate act (private by default) preserves ownership and avoids central-wiki mush. Forking mirrors code: owned copies evolve independently.
- Consequences: Pitch shows at least one compile/share moment; data model keeps provenance on forked copies (derived-from link).

## D-010 — Negative knowledge / guardrails are first-class

- Status: Decided (user-stated, 2026-10-29)
- Decision: Store what NOT to do: commands never to run, access not to grant, actions/approaches to avoid (with scope, severity, expiry). Guardrails should surface/interrupt at moment of temptation, not only on search.
- Why: Docs/comments avoid negativity; failure warnings fragment and get repeated as harm. Knowing what to avoid is as valuable as knowing what to do.
- Consequences: Memory metadata includes type=guardrail + scope/expiry; stale guardrail reads "check before obeying". Strong demo moment (blocked dangerous command). See positioning.md S-8.

## D-011 — Attempt log: rejected/uncommitted changes are memories

- Status: Decided (user-stated, 2026-10-29)
- Decision: Previous code/config changes — accepted or rejected, why — including testing failures never committed/pushed (no PR exists) are Tribe memories (what/where/outcome logs/verdict/why, linked to code area/config key).
- Why: Git records only survivors; comments bloat/rot; repeating failed experiments wastes time/resources. Attempt history prevents repeats.
- Consequences: Seed/demo should include one rejected attempt surfaced on similar next change. See positioning.md S-9.

## D-012 — Positioning: tribal knowledge system, not a memory system; infra may be components

- Status: Decided (user-stated, 2026-10-29)
- Decision: Pitch Tribe first/foremost as an individual's tribal knowledge system to reduce cognitive load. mem0/letta/zeph/notion-class tools may be used **internally**; they are not the headline competitor frame. Full record: [positioning.md](positioning.md).
- Why: Memory APIs optimise machine recall; Tribe optimises human load, ownership, portability, curation, guardrails, share/fork.
- Consequences: All pitch/demo copy leads with cognitive load + individual ownership; "memory engine" stays internal pillar language.

---

## D-013 — Stack: React web + TypeScript/Node/SQLite; Expo deferred to roadmap

- Status: Decided (user-approved recommendation, 2026-10-31)
- Decision: Ship React + Vite web app (Node + Express API, SQLite via `node:sqlite`, official TypeScript MCP SDK). React Native/Expo considered and deferred: demo is desk-based engineering work, judges need a URL with no emulator/Expo Go, MCP clients are desktop tools, and Expo-web constraints cost more than the user's RN familiarity saves. Expo capture client is roadmap.
- Meta access resolved alongside: app key in `.env.local` (git-ignored), base `https://api.meta.ai/v1`, default model `muse-spark-1.3`; live-verified 2026-10-31 (brief + grounded answers generated by the Meta model; deterministic fallback on any failure).

## D-014 — Chronology is a first-class use: current first, evolution on demand

- Status: Decided (user-stated, 2026-10-31); **implemented 2026-10-31** (newest-trusted-first ranking/citations, temporal evolution answers, per-topic evolution endpoint + UI panel; see [implementation.md](implementation.md))
- Decision: (1) Retrieval/answers reflect chronology — newer memories are retrieved and used first, so an answer leads with the current position. Recency is gated by trust: explicit supersession beats recency, verified beats unverified, stale is demoted (never silently used). (2) On temporal questions ("how did this change?", "why is it done this way now?"), Tribe explains how knowledge evolved over time — original → trigger (incident/attempt) → current verified state, with dates, using supersedes chains, versions, and attempt/decision memories. (3) An evolution view per topic shows memories/versions/links as a timeline of changing knowledge. Full scenario: [positioning.md](positioning.md) S-11.
- Why: Acting on outdated copies is the fragmentation failure (S-3); snapshots without history cannot answer "why is it done this way?", which is where tribal knowledge earns its keep.
- Consequences: ranking/citation order newest-trusted-first, a temporal-intent path in Grounded Ask, and a per-topic evolution endpoint/view — all shipped; demo may claim this behaviour.

## D-015 — Simplified surface: Capture → one chat-style Context Session → Memories; sessions travel via MCP

- Status: Decided (user-directed, 2026-10-31); implemented same day
- Decision: The product has exactly three sections. (1) Capture ("Dump anything. Tribe files it."). (2) **One** Context Session section that behaves like a chat app (ChatGPT/Gemini/Claude-style iterative conversation): user asks, Tribe answers grounded in that session's memories with citations or "I don't know", follow-ups build on the conversation. There is no separate brief panel, Grounded Ask section, Evolution section, or Guardrail section in the UI — the brief is a one-line summary in the session header, evolution and guardrail checks happen *inside* the chat (temporal questions get evolution answers; dangerous actions are blocked in-chat). (3) Memories list. Sessions are portable: the MCP server exposes `list_sessions` / `create_session` / `pull_context` (brief + recent chat) / `push_context` (optionally attached to a session) / `append_chat`, so a session started in the web app continues in an IDE client and vice versa.
- Why: Fewer sections, one mental model ("a chat that remembers, grounded in my memories"), and portability is the cross-surface promise (S-10) made concrete.
- Consequences: Chat history is persisted per session (`messages` table); answers are session-scoped; `/api/ask` and `/api/evolution` remain as APIs but are no longer separate UI sections.

## D-016 — Chat is not memory: promotion is an explicit user act; connections are explicit links

- Status: Decided (user-directed, 2026-10-31); implemented same day
- Decision: Context Session chat messages (user or assistant, web or MCP `append_chat`) are conversation only — persisted per session, never automatically Memories, and never part of the generally-available memory pool; grounding retrieves only Memories attached to the session. Any single message becomes a Memory only when the user clicks **Save as memory** on it (or uses Capture, which is an explicit filing act). Promotion attaches the new Memory to that session and records its origin.
- Connections between Memories are a `links` table (`related|supports|contradicts|supersedes|derived_from`), updated three ways: (1) automatically on promotion — the new Memory links `derived_from` to every Memory the answer cited (or top related matches when uncited); (2) automatically by lifecycle — creating a `supersedes` link marks the target `superseded`; (3) manually — any Memory can be linked to any other from its card in the UI. Seed runbook→old-runbook supersession is stored as a real link. Links are shown on Memory cards; retrieval/evolution still also use tags, status, and chronology.
- Why: A chat that silently files everything recreates the filing mess and pollutes trusted knowledge with half-formed exchange; tribal knowledge should enter the pool by a person's decision, with provenance of where it came from and what it derived from.
- Consequences: Chat can be freely exploratory; the Memory list stays curated. Future work: suggest-promotion prompts ("save this answer?") may pre-fill but never auto-save, and contradiction links should surface in answers.

## D-017 — Multi-index retrieval with fused, explainable ranking; self-evolving index keys

- Status: Decided (user-directed, 2026-10-31); implemented same day
- Decision: Retrieval is not one index. Each Memory is scored by independent signals — keyword (title/body/tags), learned index keys, chronology (last-verified recency), trust (confidence gated by stale/superseded status), graph authority (incoming links), and session membership — then fused into one ranking. Every citation carries a plain-language `why` ("matches pool, checkout · recently verified · in this session · found via learned keys"), shown in the chat UI. Separately, each Memory carries an evolving `index_keys` representation (seeded deterministically, enriched by the Meta model at capture/promotion): when a question fails, **Improve findability** proposes revised keys for candidate memories, and a revision is stored only after validation — the failed question must now retrieve that memory, and a guard question must still retrieve it too. Every attempt (accepted or rejected) is logged in `index_evolutions`. Memory bodies are never rewritten by this loop; only findability metadata evolves. A proactive question-simulation stage (generating hypothetical future questions per memory and pre-validating retrieval against them) is designed but deferred to roadmap.
- Why: Right knowledge in wrong phrasing is the most common retrieval failure; a single index cannot serve keyword, recency, trust, and relationship queries equally. Explainable fusion makes trust inspectable instead of asserted, and validated evolution improves findability without polluting curated knowledge.
- Consequences: Semantic/embedding retrieval, if added later (e.g. a local embedding model), plugs in as one more signal in the fusion — not a rewrite. Demo may claim: multiple indexes, explainable citations, and an index that learns from failed questions under validation.

## Unresolved (not yet decided — do not assume)

- U-1: Meta Model API key/endpoint/model IDs — not yet confirmed in workspace
- U-2: Hackathon acceptance status (applied/accepted?) and team roster for submission
- U-3: Demo video owner, narrator, recording machine
- U-4: Framework/language preference, if user has one (default: whatever runs locally with least setup)
- U-5: Project name/branding beyond "Tribe", logo, tagline for submission form

## Settled contract summary (for quick scan)

- Goal: Submittable Tribe MVP by Nov 4, 9:00 PM ET (Indie, Build for Your World)
- Done means: Success Criteria checklist in [plan.md](plan.md) all true, including clean-clone demo run
- Non-goals: everything under D-004 "Out"
- Validation: per-step checks in [plan.md](plan.md) Validation Plan
- Next action: user replies `go` (or edits plan), then execute plan Step 1
