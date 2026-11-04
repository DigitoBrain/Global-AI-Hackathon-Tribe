# Tribe — your tribal knowledge

Tribe is a tribal knowledge system for an individual: captured without filing, trusted because it shows its age, guarded against what already failed, and usable in every tool you work in — so you stop carrying it all in your head.

Vision: [tribe.md](tribe.md) · Positioning: [docs/positioning.md](docs/positioning.md) · Decisions: [docs/decisions.md](docs/decisions.md) · Plan: [docs/plan.md](docs/plan.md) · Implementation record: [docs/implementation.md](docs/implementation.md)

## Built for the Meta Global AI Developer Hackathon

Tribe was designed and built for the **Meta Global AI Developer Hackathon**, in the **Indie track — *Build for Your World***: build something that solves a problem in your own world. Tribe's problem is firsthand — rebuilding context across AI tools, all day, from knowledge that lives only in one person's head.

- **Submission:** this repository, plus a ~2-minute demo video — [watch the Tribe demo on YouTube](https://youtu.be/8Cukp-ba76k) — that runs the app live against the Meta Model API — no mocks; the header badge reads “Meta Model API live” throughout.
- **Powered by Meta models:** all model work goes through the Meta Model API (`muse-spark-1.3`, via [server/llm.mjs](server/llm.mjs)) — grounded answers, brief compilation, index-key generation, and smart titles. With no key configured, the same interfaces run on deterministic logic, so judges can run everything offline.
- **How to judge it in 5 minutes:** `npm install · npm run build · npm start`, open http://localhost:8787, then follow **The 2-minute demo** below; run `npm run scorecard` for measured retrieval quality, and `node scripts/mcp-probe.mjs` to see the 25-tool MCP parity surface exercised end to end.
- **What it demonstrates:** capture without filing, one persistent chat-style Context Session grounded in Memories, chronology-first answers where retired facts can never leak, warnings before dangerous actions, memory that stays chat until you promote it, and the same session continued from an IDE through MCP.

## Run it

Prerequisite: **Node.js 22.5 or newer** (Tribe uses the built-in `node:sqlite`). Check with `node --version`.

```bash
npm install --cache .npm-cache
npm run build
npm start
```

Open http://localhost:8787 in your browser. Port busy? Set `PORT` (e.g. `PORT=8788 npm start`). For development with hot reload: `npm run dev` (web on http://localhost:5173). A harmless `ExperimentalWarning: SQLite` line from Node is expected.

No API key is required: Tribe runs in deterministic offline mode. With a Meta Model API key it uses Meta models live (see below).

## Meta Model API

Copy `.env.example` to `.env.local` and set `META_API_KEY`. Defaults: base URL `https://api.meta.ai/v1`, model `muse-spark-1.3` (OpenAI-compatible chat completions). All model calls go through one provider module in [server/llm.mjs](/C:/Users/Akash/OneDrive/Documents/Global-AI-Hackathon-Tribe/server/llm.mjs); on any failure Tribe falls back to deterministic logic behind the same interface, so the demo never breaks. `.env.local` and `app_key.txt` are git-ignored — never commit a key.

## The 2-minute demo

The UI has three sections: **Capture**, **Context Session** (one chat), **Memories**.

1. **Dump anything** — paste a log or note in the capture box (try adding a fake `api_key=`): it is filed as a memory, added to the current session, and the secret is redacted before storage.
2. **Chat the session** — in Context Session, ask “What caused the checkout latency regression?” for a cited answer, then follow up (“And why did that amplify it?”) like any chat app. “Should we raise the pool to 200?” surfaces the rejected, never-committed attempt. “How has our checkout guidance changed over time?” walks the evolution. Typing the dangerous pod-delete action gets blocked by the guardrail memory, in-chat. A no-evidence question returns an explicit “I don't know.”
3. **Memories** — every answer's sources live here with trust badges; verify, deprecate, or mark feedback. A memory joins a session by being captured, saved from that session's chat, or pushed there while you work — there is no membership checklist to maintain.
4. **Take Tribe to any AI client** — `npm run mcp` gives any MCP-capable AI system the same capabilities as this web app over the same store: sessions (`list_sessions` / `create_session` / `get_session` / `pull_context` / `push_context` / `append_chat` / `list_messages` / `add_open_question` / `close_open_question`), grounded conversation (`chat` / `post_to_session` / `ask` / `promote_message`), memories (`list_memories` / `search_memories` / `get_memory` / `create_memory` / `update_memory` / `verify_memory` / `feedback_memory` / `memory_versions`), and knowledge services (`find_source` / `evolution` / `guardrail_check` / `evolve_index`). Verify with `node scripts/mcp-probe.mjs`.

Use **Reset demo** to restore the seed data at any time.

## MCP config

**VS Code (Copilot Chat, agent mode):** this repo already ships `.vscode/mcp.json`. Open it and click **Start** above the `tribe` server (or run `MCP: List Servers`), enable the Tribe tools in Copilot Chat's tool picker, then try: “Use Tribe to list my context sessions”, “Pull the context for that session and summarise where things stand”. Watch the results appear in the web app.

Two sentence shapes get two different results — pick by intent:

- **Tell a session something** (lands in chat, the session replies, nothing becomes permanent): “Tell my Checkout session that the queue-time alert fired twice today.”
- **Remember something for good** (becomes a generally-available Memory): “Use Tribe to remember this: never delete checkout pods in prod, use the rollout-restart wrapper.” Add “…and file it in my Checkout session” to also file it there.

**Claude Code / Cursor:**

```json
{ "mcpServers": { "tribe": { "command": "node", "args": ["<path-to-this-repo>/mcp/server.mjs"] } } }
```

The server resolves its store from its own location, so the host's working directory does not matter, and no API key is needed for the MCP tools themselves.

## Retrieval scorecard

`npm run scorecard` runs golden questions against the store and prints measured retrieval quality: hit@3 for answerable questions (including paraphrases), correct “I don't know” for no-evidence questions, and hard gates — retired memories must never leak into current answers, evolution must walk history oldest-first, provider lookup and the guardrail must fire. Run it after **Reset demo** for the seeded numbers (`--reset` flag does that for you). It exits non-zero if a gate fails, so it doubles as a regression check. Known honest limit, visible in its output: a paraphrase sharing almost no words with its memory can miss — retrieval is keyword + learned-key based, with no embeddings.

## Architecture

- React + Vite + TypeScript frontend, Node + Express API, SQLite (`node:sqlite`) in `data/tribe.db` — local-first, zero external services.
- One shared store ([server/store.mjs](/C:/Users/Akash/OneDrive/Documents/Global-AI-Hackathon-Tribe/server/store.mjs)) powers the web API and the MCP server: Memory Engine, Context Sessions, Context Compiler, and chat grounded by multi-index retrieval — keyword, learned index keys, chronology, trust, link-graph, and session signals fused into one ranking, with a plain-language “why” on every citation and validated index evolution from failed questions.
- Tests: `npm test` (secret scrubbing, retrieval / no-evidence behaviour).

## Where Tribe goes next

The MVP proves the core loop: capture without filing → grounded chat → trusted, chronology-aware answers → the same knowledge in every tool. The long-term capabilities build outward from that loop, in the order they compound:

**Deeper knowledge quality**
- **Semantic retrieval as one more fused signal.** Embeddings (local model, graceful offline fallback) join keyword, learned keys, chronology, trust, and graph in the same explainable ranking — closing the near-zero-word-overlap paraphrase gap the scorecard already measures. The scorecard becomes the before/after proof.
- **A proactive gardener.** Today the index learns when a user clicks *Improve findability* after a failed question. Next, Tribe periodically simulates the questions a Memory *should* answer, finds findability gaps and near-duplicate or quietly-conflicting Memories on its own, and proposes validated index revisions and supersession candidates — always under the same propose → validate → keep-or-discard discipline, and never retiring knowledge without the owner.
- **Time-travel questions.** Validity windows (`valid_to`) already record when a fact stopped being true; “what did we believe in March?” becomes answerable as a first-class query, not just an evolution narrative.
- **Trust that learns.** Feedback, verification cadence, and citation outcomes feed a fuller MemoryRank loop, so trust is earned from use, not just set at capture.

**More surfaces, same store**
- **Browser extension and CLI** for capture and ask without leaving the page or terminal you are in; an **IDE extension** beyond MCP for teams that want it native.
- **Mobile capture** (Expo/React Native) for voice notes, photos, and in-the-moment dumps — including image memories (SAM-class segmentation for “this part of the screenshot”), transcribed and indexed like text.
- **Ingestion connectors** (Slack, GitHub, docs) that propose Memories from where knowledge already leaks — always through Capture's scrub-and-file path, never a parallel store.

**From personal to shared — without a new system**
- Sharing stays content-based (copy, paste, re-capture), but grows **team spaces with permissions**: shared pools layered over personal ones, so “my Tribe” and “our Tribe” rank together while ownership and trust stay visible per Memory.
- **Collaborative Context Sessions**: several people (and their agents) working one session, with per-author provenance on every message and Memory.

**Running it for real**
- Optional sync/hosting so the same store follows you across machines (today it is deliberately local-first in one SQLite file), accounts and access control for hosted deployments, and larger-scale indexing for tens of thousands of Memories.

See [docs/plan.md](docs/plan.md) for the original plan and [docs/decisions.md](docs/decisions.md) for why the lines are drawn where they are.
