# Tribe — Positioning, Differentiation & Scenarios

Status: **Draft** (user-stated direction, 2026-10-29; becomes Final on explicit user acceptance)
Last updated: 2026-10-29
Read first: [../CONTINUE.md](../CONTINUE.md) · Decisions: [decisions.md](decisions.md) · Plan: [plan.md](plan.md) · Full vision: [../tribe.md](../tribe.md)

## One-sentence positioning

Tribe is a **tribal knowledge system for an individual** — first and foremost for one person, owned by that person, whose goal is to **reduce that individual's cognitive load**. It is NOT "just a memory system" like mem0, letta, zeph, notion and others.

Judge-facing pitch (draft):

> "Every AI tool wants your context. None of them gives it back. Tribe is your tribal knowledge — captured without filing, trusted because it shows its age, guarded against what already failed, and usable in every tool you work in. So you stop carrying it all in your head."

## Who it is for (in order)

1. **The individual user (primary).** One person writes down and stores whatever they want without worrying where or how it is stored, then uses it anywhere: IDE, browser, CLI, MCP, chat, etc.
2. **AI agents (consumers the owner grants).** The individual can share context with AI agents/tools (Claude Code, Cursor, Codex, ChatGPT, future agents) so they work from the same tribal knowledge instead of forcing re-explanation.
3. **Other users (recipients the owner chooses).** The individual can share selected memories/sessions with a person or team. Recipients can **fork** shared memories into their own Tribe and use/adapt them however they want.

Sharing is an act by the owner, never a default state. Private by default.

## The metric

Not recall accuracy for an agent. Not context-window size. **How much less the individual has to hold in their head.** Every feature must pass: "does this reduce the user's cognitive load?"

That promise, in the user's daily clothes:

- *Where did I store that?* — Gone. Dump it; Tribe files it.
- *Which tool was that in?* — Gone. Same knowledge in IDE, browser, CLI, MCP.
- *Is this latest or a stale copy?* — Tribe shows age, provenance, supersession.
- *What must I NOT do here?* — Guardrail memories interrupt before the mistake.
- *Didn't someone (maybe me) already try this and fail?* — Attempt log answers before re-spending hours/compute.
- *I know this but can't put it in the PR/doc.* — Private home, publishable by choice.
- *Someone asks me on Slack.* — Find, compile to a snippet/runbook/list, share the slice; asker forks it.

## Why this is not mem0 / letta / zeph / notion

- Those are memory **infrastructure for agents/systems** (or team archives). Their user is a system/bot or an org. Tribe's user is a **person**; agents and teammates are consumers the person grants access to.
- They can be used **internally as components** inside Tribe (semantic index, memory layer, etc.). Tribe's differentiation is the capture experience, the human curation/session loop, trust/guardrails, portability across surfaces, and share/fork semantics — not owning another vector store.
- One line for judges: *memory APIs optimise machine recall; Tribe optimises human cognitive load.*

## Core concepts (as clarified 2026-10-29)

- **Memories:** anything the user stores — notes, log files, screenshots, recordings, snippets, terminal output, decisions, failures. Stored without the user deciding filing/storage mechanics.
- **Context Sessions:** persistent workspaces AND chat-like sessions. Like AI chatbot threads, but the user can retrieve memories, create new ones, point out wrong/conflicting memories — enriching memories with metadata and connections over time. Sessions can be personal, shared (invite), or collaborative (multiple users pull/push related information).
- **Indexes (plumbing, combinable):** semantic index, keyword index, chronology index, plus graph/relationship links, recency, verification/trust, source, person, session, tags.
- **Context Compiler:** continuously maintained brief (summary, timeline, knowledge map, open questions, entities) so AI/humans consume compiled context first instead of rereading everything.
- **Sharing & forking:** select memories → optionally compile into a short snippet / runbook / simple list of steps → share to one asker or whole team (e.g. paste into Slack) → recipient forks into their own Tribe and adapts freely.
- **New joiner onboarding (one example, not the definition of sharing):** existing user shares a session; joiner starts with full context instead of shadowing for weeks.

## Scenarios (the differentiation, in daily work)

### S-1 Capture without the filing decision
User finds something useful mid-work. Every incumbent tool asks "where does this go?" (Notion page? PR comment? doc?) — so most tribal knowledge is never written down and dies in terminal scrollback/closed tabs. Tribe: dump it, deciding is Tribe's job.

### S-2 Retrieval under time pressure
Mid-incident / mid-Slack-thread / mid-review. Knowledge exists across 3 platforms, 2 outdated. User needs ONE canonical place where latest verified version wins, stale visibly demoted. Wrong-but-confident is worse than nothing.

### S-3 Fragmentation → outdated trap
Runbook updated in a doc, old steps in Slack, real fix in shell history. Without canonical store + provenance ("supersedes X, verified Tue"), people act on dead knowledge.

### S-4 Private knowledge that must not be published
Suspicions, ugly-but-working workarounds, real reasons behind decisions. Not for code comments/PRs (permanent, public, invites opinions — "too many cooks spoil the broth"). Tribe gives it a private, findable home.

### S-5 Detail overflow in public artifacts
PR with 40 min of investigation detail becomes unreadable, so detail is deleted/lost. Tribe: PR stays 5 clean lines; investigation lives in a session; reviewers pull depth themselves.

### S-6 Slack ask → compile → share → fork
Asker asks in Slack. Owner finds memories, optionally summarises into snippet/runbook/steps, shares slice to asker or team. Asker forks into own Tribe, adapts. Knowledge spreads like code: owned copies, not central wiki mush.

### S-7 New joiner
Existing user shares session; joiner forks/uses immediately with context (history, why, what failed) instead of re-deriving it.

### S-8 Negative knowledge / guardrails ("what NOT to do")
As important as what to do. Store: terminal commands never to run, access never to grant most people, actions to avoid, rejected libraries/approaches. Docs/comments avoid negativity and it fragments — so people repeat harm. Negative memories must **interrupt** (surface when user/AI is about to run command/grant access/pick rejected option), carry **scope + expiry/severity** (e.g. "until v2 migration"), and stale warnings must read "check before obeying", not gospel. Demo gold: AI about to suggest dangerous command → Tribe intervenes with incident memory → safe alternative.

### S-9 Attempt log (uncommitted failures)
Git records only survivors. The config/code change that broke testing, was never committed, never pushed, has no PR — its failure knowledge evaporates; next person repeats it, wasting time/resources/compute. Code comments can't hold every testing detail (bloat/rot). Tribe stores attempt: what changed (diff/config/flag), where, what happened (logs/errors), verdict (accepted/rejected/abandoned) + why, linked to code area/config key, surfacing on next similar edit. Capture hook: branch abandoned/stash dropped/test failed → "save why?" prompt.

### S-10 Cross-surface day
Same investigation touched in IDE (code), browser (docs/incident page), CLI (logs), MCP AI client. Context follows the person, not the tool. "Never rebuild context twice" ([../tribe.md](../tribe.md) Context Infrastructure).

## Product principles (from tribe.md §20, reaffirmed)

Reduce cognitive load · Everything linkable · Knowledge evolves, not rots · AI explains with evidence, not hallucination (cite or say "I don't know") · Context shared, not recreated · Humans + AI collaborate through same persistent context · Simple UX, sophisticated internals · **Personal-first, collaboration when needed.**

## Language to use / avoid in pitch

Use: tribal knowledge (individual-owned), cognitive load, capture without filing, guardrails, attempt log, compile → share → fork, usable everywhere you work.
Avoid leading with: team memory, org wiki, RAG, vector store, "AI memory system". (Memory Engine is an internal pillar name in [../tribe.md](../tribe.md), not the headline.)

## Hackathon translation (see plan.md)

Demo protagonist is **one engineer** with personal tribal knowledge (not "a team KB"). Finale options: share compiled slice (Slack-style) and/or new-joiner fork, plus guardrail intervention moment. Build unchanged in steps; story/framing updated per D-008..D-012 in [decisions.md](decisions.md).
