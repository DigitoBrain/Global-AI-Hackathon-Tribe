# Tribe — Implementation Record (handoff for the next session)

Last updated: 2026-10-31 · Status: MVP implemented, verified, committed. Read [../CONTINUE.md](../CONTINUE.md) first, then this file, then [plan.md](plan.md) / [decisions.md](decisions.md) (D-013 records the stack choice).

## What was built

A working thin vertical slice of [../tribe.md](../tribe.md) for the Meta Global AI Developer Hackathon (Indie, *Build for Your World*, due Nov 4, 9:00 PM ET):

- **Capture without filing** — dump box stores anything as a Memory; regex secret scrubbing redacts keys/tokens before storage and reports the count.
- **Memory Engine** — memories carry type (`note|runbook|guardrail|attempt|decision`), tags, confidence, source, `last_verified`, status (`active|stale-by-age|superseded|deprecated`), version count (old bodies kept in `versions` on edit), up/down feedback that adjusts confidence, verify-now and deprecate actions.
- **Context Session + Context Compiler** — one seeded session ("Checkout latency regression"); its brief (executive summary, timeline, open questions, entities, guardrails, attempts) is regenerated from session memories on every request.
- **Grounded Ask** — keyword + recency + trust ranking over memories; answers cite `[n]` source memories; when no memory matches, the exact behaviour is an explicit "I don't know" with no invented citation.
- **Guardrails** — `POST /api/guardrail-check` blocks dangerous actions matched against `type=guardrail` memories (seed: never `kubectl delete pods` in prod checkout).
- **Attempt log** — `type=attempt` memories store rejected/never-committed changes (seed: pool 50→200) and surface in Grounded Ask.
- **Share slice** — UI compiles a Slack-ready snippet from the brief (summary + do/never + open questions). Recipient fork semantics are in the pitch, not yet a data operation.
- **MCP context bus** — stdio MCP server over the *same* store: `pull_context` (compiled brief) and `push_context` (store a finding). This is the cross-AI handoff proof.

Deliberately not built (roadmap, D-004): Slack/GitHub/browser ingestion, multi-user editing, permissions, image/SAM, mobile/Expo client, full MemoryRank.

## Stack and layout (D-013)

TypeScript/React on the front, plain ESM Node on the back so the web API and MCP server share modules with no build step between them. SQLite via Node 24's built-in `node:sqlite` (no native dependency). Local-first: zero external services.

- [../src/App.tsx](../src/App.tsx) — single-page demo UI (capture, brief, guardrail, ask, memory cards); [../src/styles.css](../src/styles.css)
- [../server/index.mjs](../server/index.mjs) — Express API + serves `dist/` in production; [../server/store.mjs](../server/store.mjs) — schema, CRUD, compiler, ranking, grounded ask, guardrail check
- [../server/llm.mjs](../server/llm.mjs) — the only place that talks to an LLM (see below); [../server/scrub.mjs](../server/scrub.mjs) — secret patterns; [../server/seed.mjs](../server/seed.mjs) — seed + reset
- [../mcp/server.mjs](../mcp/server.mjs) — MCP tools; [../scripts/mcp-probe.mjs](../scripts/mcp-probe.mjs) — end-to-end MCP verification; [../scripts/dev.mjs](../scripts/dev.mjs) — dev runner (API :8787 + Vite :5173)
- [../tests/core.test.mjs](../tests/core.test.mjs) — `node:test` coverage for scrubbing and retrieval/no-evidence behaviour

Data model (SQLite, `data/tribe.db`, git-ignored): `memories`, `versions`, `sessions`, `session_memories`, `feedback`. Seed = 6 memories (current runbook, superseded old runbook, root-cause decision, guardrail, rejected attempt, private note) in 1 session. `POST /api/reset` restores it.

API surface: `GET /api/health`, `GET|POST /api/memories`, `PATCH /api/memories/:id`, `POST /api/memories/:id/feedback|verify`, `GET|POST /api/sessions`, `PATCH /api/sessions/:id`, `GET /api/sessions/:id[/brief]`, `POST|DELETE /api/sessions/:id/memories[/:memoryId]`, `POST /api/sessions/:id/questions`, `GET /api/evolution?tag=`, `POST /api/ask`, `POST /api/guardrail-check`, `POST /api/scrub-preview`, `POST /api/reset`.

## Meta Model API (live, verified)

- Endpoint: OpenAI-compatible `https://api.meta.ai/v1` (`POST /chat/completions`, `GET /models`), default model `muse-spark-1.3`, configurable via `META_BASE_URL` / `META_MODEL`.
- Key handling: the key lives only in `.env.local` (created from the user's `app_key.txt`); both files plus `data/*.db` are in [../.gitignore](../.gitignore). **Never commit, print, or log the key.** [../.env.example](../.env.example) carries names/defaults only.
- Two non-obvious findings, already handled in [../server/llm.mjs](../server/llm.mjs): (1) Muse Spark is a reasoning model — it spent ~540 reasoning tokens before answering, so `max_tokens` must be generous (2500) or `message.content` comes back `null`; (2) any failure (no key, 401, timeout) falls back to deterministic brief/answers behind the same interface, so the demo works offline. UI badge shows "Meta Model API live" vs "Deterministic demo mode" from `/api/health`.
- Verified live on 2026-10-31: brief summary and grounded answers generated by the Meta model (attempt-log answer cited the rejected change correctly).

## Verification evidence (2026-10-31, this machine)

- `npm test` — 2/2 pass (scrub redaction; ranking + zero hits for a no-evidence query).
- `npm run build` — Vite production build succeeds. Note: inside this workspace's sandboxed shell, esbuild needs elevated permission to read parent dirs; on a normal clone it runs plainly.
- Running app (`npm run build` then `npm start`, http://localhost:8787): `/api/health` reports Meta live; 6 seed memories; brief returned with `llm: "meta"`; cited answer for the root-cause question; `dontKnow: true` for "What is our office Wi-Fi password?"; guardrail `blocked: true` for the pod-delete command; capture of a body containing `api_key=sk-...` stored with 1 redaction and no secret in the stored text; `GET /` serves the built UI (200).
- MCP: `node scripts/mcp-probe.mjs` listed `pull_context, push_context`, pulled the compiled brief, and pushed a finding visible via the API.
- Bugs found and fixed during verification: substring search matched short terms inside unrelated words (now whole-token matching, min length 3); LLM token budget too small for a reasoning model (see above).

## Run / demo commands

```bash
npm install --cache .npm-cache   # local cache avoids npm-cache permission issues on this machine
npm run build
npm start                        # http://localhost:8787
npm run dev                      # dev: API :8787 + Vite :5173 with hot reload
npm test
node scripts/mcp-probe.mjs       # MCP proof
```

Demo flow and judge instructions: [../README.md](../README.md). Reset-to-seed is the "Reset demo" button (or `POST /api/reset`).

## Known limitations / honest caveats

- Retrieval is keyword-based (no embeddings yet); ranking = keyword hits + recency + confidence with stale/deprecated demotion. Good enough for the seeded demo; semantic search is the first upgrade.
- Simplified surface (D-015) implemented 2026-10-31: UI is exactly Capture → Context Session chat → Memories. Chat is persisted per session (`messages` table, `POST /api/sessions/:id/chat`), session-scoped and grounded, with referential follow-ups inheriting context (non-referential new questions do not — regression-tested), guardrail blocks and evolution answers inside the chat, brief reduced to a header line. MCP grew to `list_sessions`/`create_session`/`pull_context` (brief + recent chat)/`push_context` (session attach)/`append_chat` for IDE continuation; probe verifies create→push→pull→append. Verified live: cited chat answer, in-chat guardrail block, "I don't know", 6 persisted messages, empty-session guidance.
- Chronology behaviour (D-014 / S-11) implemented 2026-10-31: ranking weights last-verified recency over confidence (superseded always last, stale demoted); temporal questions ("how has X changed", "why this way now") get an oldest→current evolution narrative over the full chain including superseded entries; `GET /api/evolution?tag=` + UI timeline panel show per-topic history. Sessions are manageable end-to-end: create/switch/archive-resume, attach/detach memories, add open questions, capture-into-session, session-vs-all ask scope — all verified live via the API, then reset to seed.
- The web UI edits via API exist (PATCH) but the page exposes only feedback/verify/deprecate, not a full edit form or version-history viewer (cut-order items, D-007).
- Share = generated snippet only; fork-on-receive is not implemented as a data operation.
- Still no full memory edit form or version-history viewer in the UI (API supports PATCH; versions are counted, not displayed).
- `node:sqlite` prints an ExperimentalWarning on Node 24; harmless.

## What remains before submission (Nov 4, 9:00 PM ET)

1. Clean-clone test: fresh clone → README only → full demo (not yet done).
2. Demo video: script + recording from the clean run, showing a real Meta-backed run (owner/narrator unconfirmed).
3. Submission form copy (problem/solution/tech/what's next) and hackathon acceptance/team facts (U-2, still open).
4. Optional polish in cut-order safety: create-session + attach-memory UI, version-history viewer, embedding retrieval.

## Resume instructions for a new session

Read [../CONTINUE.md](../CONTINUE.md), this file, then [decisions.md](decisions.md). Do not re-decide D-001…D-013 silently. Check `git log`/`git status` — the tree may have advanced. Never read or print `app_key.txt` / `.env.local` values; if the Meta badge shows deterministic mode, check `/api/health` before assuming the key is broken (fallback is by design).
