# Continue Here — Tribe Hackathon (read this first)

> If you are a new session/agent picking this up cold: read this file top to bottom, then [docs/implementation.md](docs/implementation.md) (what is built, verified, and left), then [docs/positioning.md](docs/positioning.md), then [docs/decisions.md](docs/decisions.md), then [docs/plan.md](docs/plan.md), then [tribe.md](tribe.md). Do not re-ask decisions already logged as **Decided** unless the user reopens them.

Last updated: 2026-10-31 (MVP implemented and verified; Meta Model API live)
Documentation status: **Final** (user accepted plan 2026-10-31)

## What this project is

**Tribe** — a **tribal knowledge system for an individual** (NOT just a memory system, NOT team-memory-first). Full vision (20 capability areas): [tribe.md](tribe.md). Positioning/scenarios: [docs/positioning.md](docs/positioning.md).
One-line pitch: *your tribal knowledge — captured without filing, trusted because it shows its age, guarded against what already failed, usable in every tool you work in — so you stop carrying it all in your head.* Goal: **reduce the individual's cognitive load.** The owner may then share with AI agents or other users (who fork it); private by default.

We are building a hackathon MVP slice of that vision, not the whole platform.

## The hackathon

- Event: Meta Global AI Developer Hackathon (Cerebral Valley, hosted by Meta & Cerebral Valley)
- Landing page: https://cerebralvalley.ai/e/meta-ai-developer-hackathon
- Details page: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details
- Format: remote, worldwide, free if selected; max 20,000 accepted applicants (rolling review)
- Dates: Oct 26 – Nov 4 (EST). **Project submissions due Nov 4, 9:00 PM ET.** Judging Nov 4–8, winners Nov 9.
- Prizes: $1,000,000 total across two tracks
- Models to build with (per event page): Muse Spark series, Muse Wonder, Muse Image and SAM 3.1 through Meta Model API; Meta open-weights models; Muse Code coding agent
- Inference partners mentioned on event page: Baseten ($100 credits, 2M TPM to select participants), Modal ($100 credits), Fireworks ($100 credits)
- Tracks: **Indie developer** (creativity, technical ambition, whether it works) vs **Startup** (technical execution, production readiness)
- Themes: **Build for Your World** vs **Push the Frontier**

## Current status

- [x] Read [tribe.md](tribe.md) (vision doc, 20 sections)
- [x] Fetched and reviewed hackathon pages above (2026-10-29)
- [x] Discussed scope with user; user selected: Indie track, Engineering-team demo, Web app + MCP
- [x] Wrote canonical plan: [docs/plan.md](docs/plan.md)
- [x] Wrote decision log: [docs/decisions.md](docs/decisions.md)
- [x] Wrote this recovery file
- [x] User clarified positioning (individual-first, cognitive load, share/fork, guardrails, attempt log) → recorded in [docs/positioning.md](docs/positioning.md) + decisions D-008…D-012
- [x] User accepted plan; MVP implemented (React web + Node/SQLite + MCP, D-013) — details in [docs/implementation.md](docs/implementation.md)
- [x] Meta Model API key configured in `.env.local` (git-ignored) and live-verified with `muse-spark-1.3`
- [x] Verified: `npm test` 2/2, production build, all demo paths via live API, MCP probe push/pull (see [docs/implementation.md](docs/implementation.md))
- [x] Repo pushed by user to https://github.com/DigitoBrain/Global-AI-Hackathon-Tribe
- [ ] Remaining: clean-clone test, demo video recording, submission form copy, team/acceptance facts for submission

Workspace now contains the full app (`src/`, `server/`, `mcp/`, `scripts/`, `tests/`, `data/` ignored DB). Untracked user files `conversation-2026-10-30-185227.txt` and `muse-session.txt` are not part of the project — leave them uncommitted.

## Decisions already made (do not re-decide silently)

See [docs/decisions.md](docs/decisions.md) for rationale. Summary:

1. **D-001 Track/theme:** Indie developer + *Build for Your World*
2. **D-002 Demo story:** Engineering team — production incident / investigation (seed: checkout latency regression)
3. **D-003 Build shape:** Web app + MCP server over one shared store
4. **D-004 MVP scope:** Memory Engine core + Context Sessions + Context Compiler + Grounded Ask (citations, explicit "I don't know") + MCP push/pull + basic secret scrubbing. Everything else in [tribe.md](tribe.md) is roadmap, not build.
5. **D-005 LLM access:** One `llm` provider module targeting Meta Model API (Muse Spark / Muse Wonder class), with deterministic offline stub behind same interface so demo never blocks on keys. Real Meta endpoint is default when key configured.
6. **D-006 Storage:** Local-first, single repo (file/SQLite-class store), zero external services required to run demo
7. **D-007 Cut order if time slips:** feedback signals → version-history UI (keep data) → MCP push (keep pull). Never cut grounded citations or "I don't know" path.
8. **D-008 Individual-first:** one owner, store anything without filing decisions, use anywhere (IDE/browser/CLI/MCP); sharing is owner's choice. Demo hero = one engineer.
9. **D-009 Share = compile → share slice → fork:** snippet/runbook/steps to Slack asker or team, or session to new joiner; recipients fork + adapt.
10. **D-010 Guardrails:** negative knowledge (never-run commands, never-grant access, avoided actions) first-class, scoped/expiring, interrupts at moment of temptation.
11. **D-011 Attempt log:** accepted/rejected code & config changes incl. uncommitted test failures (what/where/logs/verdict/why) to prevent repeats.
12. **D-012 Positioning:** tribal knowledge ≠ memory system; mem0/letta/zeph/notion may be internal components. See [docs/positioning.md](docs/positioning.md) scenarios S-1…S-10.
13. **D-013 Stack:** React web + Node/Express + SQLite + TS MCP SDK; Expo deferred to roadmap. Meta key live (`muse-spark-1.3`).

## The plan (canonical copy)

Full plan: [docs/plan.md](docs/plan.md). Execution steps in order:

1. Scaffold + data model (`Memory`, `Session`, `Link`, `Citation`) + incident seed loader
2. Memory Engine UI + API (capture with scrubbing, trust badges, version history, links, supersede/deprecate)
3. Sessions + Context Compiler (auto-regenerated brief: summary, timeline, open questions, entities)
4. Grounded Ask (ranked retrieval: semantic + recency + trust; cited answers; "I don't know"; feedback)
5. MCP context bus (`push_context` / `pull_context` over same store + client config docs)
6. Demo polish (reset-to-seed guided demo, empty/loading/error states, 2-minute click-through)
7. Submission package (README, demo video script + recording, submission form copy, clean-clone test)

## How a new session should resume

1. Read this file, [docs/implementation.md](docs/implementation.md), [docs/decisions.md](docs/decisions.md), [docs/plan.md](docs/plan.md), [tribe.md](tribe.md).
2. Check current workspace state (`git status` / `git log` / file listing) — it may have advanced beyond this snapshot.
3. Run the app (`npm install --cache .npm-cache`, `npm run build`, `npm start` → http://localhost:8787) and confirm `/api/health` before changing code.
4. Continue with "What remains before submission" in [docs/implementation.md](docs/implementation.md); update the **Current status** checklist above and [docs/decisions.md](docs/decisions.md) as you go (append, don't rewrite decided items).
5. Keep this file's "Last updated" and status current after each major step so the next handoff is lossless. Never read/print `app_key.txt` or `.env.local` values.

## Open questions / blockers

- ~~Meta Model API key/endpoint~~ Resolved 2026-10-31: key in `.env.local`, `https://api.meta.ai/v1`, `muse-spark-1.3`, live-verified.
- Is the user already accepted into the hackathon, or is an application still to be submitted? (Application deadline was Oct 25, 11:59 PM ET per event page; cap 20,000.)
- Solo build, or are there teammates to list in the submission?
- Demo video: who records/narrates, and on what machine?

## Sources checked this session

- https://cerebralvalley.ai/e/meta-ai-developer-hackathon (fetched 2026-10-29; dates, tracks, themes, models, prizes above come from here)
- https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details (fetched 2026-10-29; page is JS-rendered, returned mostly shell — treat landing page as source of truth)
- [tribe.md](tribe.md) (user's vision doc, 8,315 bytes, 20 sections)

## Exact next action

Clean-clone test → demo video → submission copy, per "What remains before submission" in [docs/implementation.md](docs/implementation.md).
