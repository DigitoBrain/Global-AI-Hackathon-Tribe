import express from "express";
import path from "node:path";
import fs from "node:fs";
import {
  listMemories, getMemory, createMemory, updateMemory, addFeedback, verifyMemory,
  listSessions, getSession, compileBriefSmart, groundedAsk, guardrailCheck, withMeta,
} from "./store.mjs";
import { seedIfEmpty, resetSeed } from "./seed.mjs";
import { llmStatus, llmConfig } from "./llm.mjs";
import { scrubSecrets } from "./scrub.mjs";

seedIfEmpty();
const app = express();
app.use(express.json({ limit: "1mb" }));
const PORT = process.env.PORT || 8787;

app.get("/api/health", async (_req, res) => {
  const llm = await llmStatus();
  res.json({ ok: true, llm, model: llmConfig.model, note: llm.live ? "Meta Model API live" : "Offline deterministic mode (Meta key missing or rejected)" });
});
app.get("/api/memories", (_req, res) => res.json(listMemories().map(withMeta)));
app.post("/api/memories", (req, res) => {
  if (!req.body?.body) return res.status(400).json({ error: "body is required" });
  res.status(201).json(createMemory(req.body));
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
app.get("/api/sessions/:id", (req, res) => {
  const s = getSession(Number(req.params.id));
  return s ? res.json({ ...s, memories: s.memories.map(withMeta) }) : res.status(404).json({ error: "not found" });
});
app.get("/api/sessions/:id/brief", async (req, res) => {
  const s = getSession(Number(req.params.id));
  return s ? res.json(await compileBriefSmart(s)) : res.status(404).json({ error: "not found" });
});
app.post("/api/ask", async (req, res) => {
  if (!req.body?.question) return res.status(400).json({ error: "question is required" });
  res.json(await groundedAsk(req.body.question, req.body.sessionId ? Number(req.body.sessionId) : null));
});
app.post("/api/guardrail-check", (req, res) => res.json(guardrailCheck(req.body?.action || "")));
app.post("/api/scrub-preview", (req, res) => res.json(scrubSecrets(req.body?.text || "")));
app.post("/api/reset", (_req, res) => { resetSeed(); res.json({ ok: true }); });

const dist = path.join(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}
app.listen(PORT, () => console.log(`Tribe API on http://localhost:${PORT}`));
