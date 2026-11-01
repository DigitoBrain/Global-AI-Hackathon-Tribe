import express from "express";
import path from "node:path";
import fs from "node:fs";
import {
  listMemories, getMemory, createMemory, updateMemory, addFeedback, verifyMemory,
  listSessions, getSession, createSession, updateSession, attachMemory, detachMemory,
  addOpenQuestion, evolutionChain, compileBriefSmart, groundedAsk, guardrailCheck, withMeta,
  listMessages, sessionChat, repoRoot, promoteMessage, createLink,
  enrichMemoryKeys, evolveIndex, backfillKeys, findSupersessionCandidate,
  findSourceMemories, isProviderMemory,
} from "./store.mjs";
import { seedIfEmpty, resetSeed } from "./seed.mjs";
import { llmStatus, llmConfig } from "./llm.mjs";
import { scrubSecrets } from "./scrub.mjs";

seedIfEmpty();
backfillKeys();
const app = express();
app.use(express.json({ limit: "1mb" }));
const PORT = process.env.PORT || 8787;

app.get("/api/health", async (_req, res) => {
  const llm = await llmStatus();
  res.json({ ok: true, llm, model: llmConfig.model, note: llm.live ? "Meta Model API live" : "Offline deterministic mode (Meta key missing or rejected)" });
});
app.get("/api/memories", (_req, res) => res.json(listMemories().map(withMeta)));
app.post("/api/memories", async (req, res) => {
  if (!req.body?.body) return res.status(400).json({ error: "body is required" });
  const out = createMemory(req.body);
  if (req.body.sessionId) attachMemory(Number(req.body.sessionId), out.memory.id);
  const enriched = await enrichMemoryKeys(out.memory.id);
  const fresh = enriched || out.memory;
  const suggestion = findSupersessionCandidate(fresh, listMemories());
  res.status(201).json({ ...out, memory: withMeta(fresh), supersedes_suggestion: suggestion });
});
app.patch("/api/memories/:id", (req, res) => {
  const m = updateMemory(Number(req.params.id), req.body || {});
  return m ? res.json(withMeta(m)) : res.status(404).json({ error: "not found" });
});
app.post("/api/memories/:id/feedback", (req, res) => {
  const m = addFeedback(Number(req.params.id), req.body?.signal === "down" ? "down" : "up");
  return m ? res.json(withMeta(m)) : res.status(404).json({ error: "not found" });
});
app.post("/api/memories/:id/verify", (req, res) => {
  const m = verifyMemory(Number(req.params.id));
  return m ? res.json(withMeta(m)) : res.status(404).json({ error: "not found" });
});
app.get("/api/sessions", (_req, res) => res.json(listSessions()));
app.post("/api/sessions", (req, res) => {
  if (!req.body?.title?.trim()) return res.status(400).json({ error: "title is required" });
  res.status(201).json(createSession(req.body.title.trim()));
});
app.patch("/api/sessions/:id", (req, res) => {
  const s = updateSession(Number(req.params.id), req.body || {});
  return s ? res.json(s) : res.status(404).json({ error: "not found" });
});
app.post("/api/sessions/:id/memories", (req, res) => {
  const s = attachMemory(Number(req.params.id), Number(req.body?.memoryId));
  return s ? res.json({ ...s, memories: s.memories.map(withMeta) }) : res.status(404).json({ error: "session or memory not found" });
});
app.delete("/api/sessions/:id/memories/:memoryId", (req, res) => {
  const s = detachMemory(Number(req.params.id), Number(req.params.memoryId));
  return s ? res.json({ ...s, memories: s.memories.map(withMeta) }) : res.status(404).json({ error: "not found" });
});
app.post("/api/sessions/:id/questions", (req, res) => {
  const s = addOpenQuestion(Number(req.params.id), req.body?.question || "");
  return s ? res.json(s) : res.status(400).json({ error: "question is required" });
});
app.get("/api/sessions/:id/messages", (req, res) => {
  return getSession(Number(req.params.id))
    ? res.json(listMessages(Number(req.params.id)))
    : res.status(404).json({ error: "not found" });
});
app.post("/api/sessions/:id/chat", async (req, res) => {
  if (!req.body?.message?.trim()) return res.status(400).json({ error: "message is required" });
  const out = await sessionChat(Number(req.params.id), req.body.message.trim());
  return out ? res.json(out) : res.status(404).json({ error: "session not found" });
});
app.get("/api/evolution", (req, res) => {
  const chain = evolutionChain(listMemories().map(withMeta), req.query.tag || req.query.q || "");
  res.json({ topic: req.query.tag || req.query.q || "", chain });
});
app.get("/api/sessions/:id", (req, res) => {
  const s = getSession(Number(req.params.id));
  return s ? res.json({ ...s, memories: s.memories.map(withMeta) }) : res.status(404).json({ error: "not found" });
});
app.get("/api/sessions/:id/brief", async (req, res) => {
  const s = getSession(Number(req.params.id));
  return s ? res.json(await compileBriefSmart(s)) : res.status(404).json({ error: "not found" });
});
app.post("/api/sessions/:id/messages/:messageId/promote", async (req, res) => {
  const out = promoteMessage(Number(req.params.id), Number(req.params.messageId));
  if (!out) return res.status(404).json({ error: "message not found" });
  if (!out.already) await enrichMemoryKeys(out.memory.id);
  const fresh = getMemory(out.memory.id);
  const suggestion = fresh && !out.already ? findSupersessionCandidate(fresh, listMemories()) : null;
  return res.status(out.already ? 200 : 201).json({ ...out, memory: fresh ? withMeta(fresh) : out.memory, supersedes_suggestion: suggestion });
});
app.post("/api/sessions/:id/evolve", async (req, res) => {
  if (!req.body?.question?.trim()) return res.status(400).json({ error: "question is required" });
  res.json(await evolveIndex(req.body.question.trim(), Number(req.params.id)));
});
app.post("/api/memories/:id/links", (req, res) => {
  const kind = ["related", "supports", "contradicts", "supersedes", "derived_from"].includes(req.body?.kind) ? req.body.kind : "related";
  const links = createLink(Number(req.params.id), Number(req.body?.toId), kind);
  return links ? res.status(201).json({ links }) : res.status(400).json({ error: "valid from/to memories required" });
});
app.get("/api/sources", (req, res) => {
  const all = listMemories().filter((m) => m.status === "active" && isProviderMemory(m));
  res.json(req.query.q ? findSourceMemories(req.query.q) : all.map(withMeta));
});
app.post("/api/ask", async (req, res) => {
  if (!req.body?.question) return res.status(400).json({ error: "question is required" });
  res.json(await groundedAsk(req.body.question, req.body.sessionId ? Number(req.body.sessionId) : null));
});
app.post("/api/guardrail-check", (req, res) => res.json(guardrailCheck(req.body?.action || "")));
app.post("/api/scrub-preview", (req, res) => res.json(scrubSecrets(req.body?.text || "")));
app.post("/api/reset", (_req, res) => { resetSeed(); res.json({ ok: true }); });

const dist = path.join(repoRoot, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}
app.listen(PORT, () => console.log(`Tribe API on http://localhost:${PORT}`));
