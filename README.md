# Tribe — your tribal knowledge

Tribe is a tribal knowledge system for an individual: captured without filing, trusted because it shows its age, guarded against what already failed, and usable in every tool you work in — so you stop carrying it all in your head.

Built for the Meta Global AI Developer Hackathon (Indie track, *Build for Your World*). Vision: [tribe.md](tribe.md) · Positioning: [docs/positioning.md](docs/positioning.md) · Decisions: [docs/decisions.md](docs/decisions.md) · Plan: [docs/plan.md](docs/plan.md) · Implementation record: [docs/implementation.md](docs/implementation.md)

## Run it

```bash
npm install --cache .npm-cache
npm run build
npm start
```

Open http://localhost:8787 in your browser. For development with hot reload: `npm run dev` (web on http://localhost:5173).

No API key is required: Tribe runs in deterministic offline mode. With a Meta Model API key it uses Meta models live (see below).

## Meta Model API

Copy `.env.example` to `.env.local` and set `META_API_KEY`. Defaults: base URL `https://api.meta.ai/v1`, model `muse-spark-1.3` (OpenAI-compatible chat completions). All model calls go through one provider module in [server/llm.mjs](/C:/Users/Akash/OneDrive/Documents/Global-AI-Hackathon-Tribe/server/llm.mjs); on any failure Tribe falls back to deterministic logic behind the same interface, so the demo never breaks. `.env.local` and `app_key.txt` are git-ignored — never commit a key.

## The 2-minute demo

1. **Dump anything** — paste a log or note in the capture box (try adding `api_key=sk-...`): it is filed as a memory and the secret is redacted before storage.
2. **Compiled brief** — the checkout-latency session brief (summary, timeline, open questions) regenerates from its memories; with a key, the summary is written by the Meta model.
3. **Guardrail** — check `kubectl delete pods -n prod checkout`: Tribe blocks it with the Mar 3 incident memory and the safe alternative.
4. **Grounded Ask** — “What caused the checkout latency regression?” returns a cited answer; “Should we raise the pool to 200?” surfaces the rejected, never-committed attempt; a no-evidence question returns an explicit “I don't know.”
5. **MCP handoff** — `npm run mcp` serves `pull_context` / `push_context` over the same store. Verify with `node scripts/mcp-probe.mjs`: a second AI client pulls the compiled brief and pushes a finding that appears in the web app.

Use **Reset demo** to restore the seed data at any time.

## MCP config (Claude Code / Cursor)

```json
{ "mcpServers": { "tribe": { "command": "node", "args": ["mcp/server.mjs"], "cwd": "<path-to-this-repo>" } } }
```

## Architecture

- React + Vite + TypeScript frontend, Node + Express API, SQLite (`node:sqlite`) in `data/tribe.db` — local-first, zero external services.
- One shared store ([server/store.mjs](/C:/Users/Akash/OneDrive/Documents/Global-AI-Hackathon-Tribe/server/store.mjs)) powers the web API and the MCP server: Memory Engine, Context Sessions, Context Compiler, Grounded Ask with trust/recency ranking.
- Tests: `npm test` (secret scrubbing, retrieval / no-evidence behaviour).

## Roadmap (not in this MVP)

Slack/GitHub/browser ingestion, real-time collaboration, team permissions, Expo mobile capture client, SAM/image memories, full MemoryRank learning loop. See [docs/plan.md](docs/plan.md).
