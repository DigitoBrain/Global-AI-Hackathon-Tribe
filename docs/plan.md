# Tribe — Hackathon Plan

Status: **Final** (accepted 2026-10-31; Steps 1–6 implemented and verified, Step 7 in progress — see [implementation.md](implementation.md))
Last updated: 2026-10-31
Entry point for new sessions: [../CONTINUE.md](../CONTINUE.md)
Decisions behind this plan: [decisions.md](decisions.md)

## Goal

Ship **Tribe** for the Meta Global AI Developer Hackathon (Indie track, *Build for Your World* theme) by **Nov 4, 9:00 PM ET**: a persistent context layer for engineering teams where knowledge is captured once, compiled into AI-ready context, and reused across people and AI tools — never rebuilt twice.

Submissions are judged in this track on creativity, technical ambition, and whether it works, so the plan favours one polished end-to-end demo over breadth from [../tribe.md](../tribe.md).

## Success Criteria

- A judge can run the app locally and complete the demo flow without setup beyond an API key (with an offline demo mode if no key is present).
- Capture → Memory → Context Session → Context Compiler → grounded answer works end to end on seeded engineering data.
- Every AI answer cites its source memories; when no evidence exists, Tribe explicitly says it doesn't know instead of hallucinating.
- A second AI client resumes the first AI's work via MCP without the user re-explaining context.
- Submission package is complete: repo, README with run instructions, demo video script/recording, and hackathon submission text.

## Approach

Build a thin vertical slice of the vision in [../tribe.md](../tribe.md), not all 20 capability areas:

**In scope (MVP):**
- **Memory Engine (core):** create/edit memories with provenance, tags, confidence, last-verified date, version history; duplicate/contradiction flags; `supersedes` links.
- **Context Sessions:** create a session (e.g. an incident investigation), attach memories/notes/questions/decisions, archive/resume it.
- **Context Compiler:** auto-maintained session brief — executive summary, timeline, open questions, key entities — regenerated as memories change.
- **Grounded Ask:** question answering over memories that returns cited evidence, trust/recency-aware ranking, and an explicit "I don't know" when evidence is missing.
- **Context bus via MCP:** a small MCP server exposing `push_context` / `pull_context` over the same store, so another AI tool can resume a session.
- **Seed story (individual-first, per [positioning.md](positioning.md)):** one engineer + their personal tribal knowledge around a checkout-latency incident — runbook, root cause, one stale/contradicting memory, one guardrail ("never run X"), one rejected uncommitted change (attempt log). Demo beats: dump-anything capture → guardrail intervention → compiled brief → cited answer / "I don't know" → compile-share slice (Slack-style) or MCP handoff.
- Basic secret scrubbing on capture (regex redaction) as a nod to the Security section of [../tribe.md](../tribe.md).

**Explicitly out of scope:** Slack/GitHub/browser ingestion, real-time multi-user editing, team permissions, image/SAM features, learning-signal ranking beyond simple feedback, and mobile. These stay in the README as roadmap.

**Key decisions:** (full rationale in [decisions.md](decisions.md))
- *Web app + MCP over one shared store* (D-003): the web app carries the visual demo; MCP proves the cross-AI claim.
- *Provider abstraction for Meta models* (D-005): all LLM calls go through one `llm` module targeting the Meta Model API (Muse Spark / Muse Wonder class models named on the hackathon page); a deterministic offline stub sits behind the same interface so the demo never blocks on keys or rate limits. Using the real Meta endpoint is the default when a key is configured.
- *Single repo, local-first storage* (D-006): zero external services, so judges and the demo video always work.

## Steps

1. **Scaffold + data model.** Single-repo web app with a local store. Models: `Memory`, `Session`, `Link` (supports / contradicts / supersedes / derived-from), `Citation`. Seed loader for the incident story.
2. **Memory Engine UI + API.** Capture form with secret scrubbing, memory list with trust badges (confidence, last verified, stale flag), edit with version history, link memories, mark superseded/deprecated.
3. **Sessions + Context Compiler.** Session workspace: attach memories, add questions/decisions, timeline view. Compiler panel that regenerates the brief (summary, open questions, entities) from session contents via the LLM module, with offline fallback.
4. **Grounded Ask.** Ask box scoped to a session or all memories: ranked retrieval (semantic + recency + trust), answer with inline citations linking to memories, feedback (up/down) stored as a signal, and the no-evidence "I don't know" path.
5. **MCP context bus.** MCP server with push/pull tools over the same store; document the Claude Code / Cursor config snippet in the README.
6. **Demo polish.** Guided demo mode that resets to seed data, empty states, loading/error states, and a 2-minute click-through that hits: capture, contradiction warning, compiled brief, cited answer, "I don't know", MCP handoff.
7. **Submission package.** README (what/why/how to run, architecture, Meta model usage, roadmap), demo video script and recording, submission form copy (problem, solution, tech, what's next), final clean-clone test.

## Validation Plan

- After step 2: create/edit/link memories; verify version history and stale flagging by hand in the running app.
- After step 3: add a memory to the seeded session and confirm the compiled brief changes without manual refresh of content.
- After step 4: ask a question answerable from seed data (expect cited answer), then one with no evidence (expect explicit "I don't know", no invented citation).
- After step 5: pull the session context from a second MCP client and confirm it returns the compiled brief; push a finding and confirm it appears in the web app.
- Before submission: fresh clone → follow README only → run the full 2-minute demo; record the video from that clean run.

## Risks / Open Questions

- **Meta Model API access/keys:** not yet confirmed in this workspace. The provider abstraction de-risks building, but a real Meta-backed run must be captured in the demo video before submitting; if keys arrive late, this becomes the top priority swap-in.
- **Time:** Oct 29 → Nov 4 leaves ~6 days. Cut order if slipping (D-007): feedback signals → version-history UI (keep data) → MCP push (keep pull). Never cut grounded citations or the "I don't know" path — they are the differentiator.
- **Scope creep from [../tribe.md](../tribe.md):** anything outside the MVP list above goes to the README roadmap, not the build.
- **Unconfirmed facts:** hackathon acceptance status, teammates, API keys, recording owner — see [../CONTINUE.md](../CONTINUE.md) open questions.

## Sources

- https://cerebralvalley.ai/e/meta-ai-developer-hackathon
- Local: [../tribe.md](../tribe.md)
