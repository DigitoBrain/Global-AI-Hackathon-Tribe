import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { scrubSecrets } from "./scrub.mjs";
import { llmChat } from "./llm.mjs";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "tribe.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'note', tags TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.8, source TEXT DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'active', supersedes_id INTEGER,
  scope TEXT DEFAULT '', severity TEXT DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_verified TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id INTEGER NOT NULL,
  title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  open_questions TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_memories (
  session_id INTEGER NOT NULL, memory_id INTEGER NOT NULL, PRIMARY KEY (session_id, memory_id)
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id INTEGER NOT NULL,
  signal TEXT NOT NULL, created_at TEXT NOT NULL
);
`);

const now = () => new Date().toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();
const parse = (m) => ({ ...m, tags: JSON.parse(m.tags || "[]") });

export function listMemories() {
  return db.prepare("SELECT * FROM memories ORDER BY updated_at DESC").all().map(parse);
}
export function getMemory(id) {
  const m = db.prepare("SELECT * FROM memories WHERE id=?").get(id);
  return m ? parse(m) : null;
}
export function listSessions() {
  return db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all()
    .map((s) => ({ ...s, open_questions: JSON.parse(s.open_questions || "[]") }));
}
export function getSession(id) {
  const s = db.prepare("SELECT * FROM sessions WHERE id=?").get(id);
  if (!s) return null;
  const memories = db.prepare(
    `SELECT m.* FROM memories m JOIN session_memories sm ON sm.memory_id=m.id
     WHERE sm.session_id=? ORDER BY m.created_at`).all(id).map(parse);
  return { ...s, open_questions: JSON.parse(s.open_questions || "[]"), memories };
}

export function createMemory(input) {
  const scrubbed = scrubSecrets(input.body || "");
  const t = now();
  const r = db.prepare(
    `INSERT INTO memories (title,body,type,tags,confidence,source,status,supersedes_id,scope,severity,created_at,updated_at,last_verified)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    input.title || "Untitled memory", scrubbed.text, input.type || "note",
    JSON.stringify(input.tags || []), input.confidence ?? 0.8, input.source || "manual",
    input.status || "active", input.supersedes_id || null, input.scope || "",
    input.severity || "", t, t, t);
  const mem = getMemory(Number(r.lastInsertRowid));
  return { memory: mem, redactions: scrubbed.redactions };
}

export function updateMemory(id, input) {
  const old = getMemory(id);
  if (!old) return null;
  db.prepare("INSERT INTO versions (memory_id,title,body,created_at) VALUES (?,?,?,?)")
    .run(id, old.title, old.body, now());
  const scrubbed = scrubSecrets(input.body ?? old.body);
  db.prepare("UPDATE memories SET title=?,body=?,type=?,status=?,confidence=?,updated_at=? WHERE id=?")
    .run(input.title ?? old.title, scrubbed.text, input.type ?? old.type,
      input.status ?? old.status, input.confidence ?? old.confidence, now(), id);
  return getMemory(id);
}

export function addFeedback(id, signal) {
  const m = getMemory(id);
  if (!m) return null;
  db.prepare("INSERT INTO feedback (memory_id,signal,created_at) VALUES (?,?,?)").run(id, signal, now());
  const delta = signal === "up" ? 0.05 : -0.08;
  db.prepare("UPDATE memories SET confidence=?,updated_at=? WHERE id=?")
    .run(Math.min(1, Math.max(0.05, m.confidence + delta)), now(), id);
  return getMemory(id);
}

export function verifyMemory(id) {
  db.prepare("UPDATE memories SET last_verified=?,status=CASE WHEN status='stale' THEN 'active' ELSE status END,updated_at=? WHERE id=?")
    .run(now(), now(), id);
  return getMemory(id);
}

export function versionCount(id) {
  return db.prepare("SELECT COUNT(*) c FROM versions WHERE memory_id=?").get(id).c;
}

export function isStale(m) {
  return m.status !== "deprecated" && Date.now() - new Date(m.last_verified).getTime() > 30 * 864e5;
}
export function withMeta(m) {
  return { ...m, stale: isStale(m), versions: versionCount(m.id) };
}

export function compileBrief(session) {
  const mems = session.memories || [];
  const active = mems.filter((m) => m.status !== "deprecated");
  const root = active.find((m) => m.type === "decision") || active[0];
  const guardrails = active.filter((m) => m.type === "guardrail");
  const attempts = active.filter((m) => m.type === "attempt");
  const entities = [...new Set(active.flatMap((m) => m.tags))].slice(0, 8);
  const summary = root
    ? `${session.title}: ${root.title}. ${active.length} memories (${guardrails.length} guardrails, ${attempts.length} rejected attempts). Latest verified knowledge wins; stale items are demoted.`
    : `${session.title}: no memories yet.`;
  return {
    session_id: session.id, title: session.title, summary,
    timeline: active.map((m) => ({ at: m.created_at, title: m.title, type: m.type, status: m.status })),
    open_questions: session.open_questions, entities, guardrails, attempts,
    memory_count: active.length, compiled_at: now(),
  };
}

export async function compileBriefSmart(session) {
  const brief = compileBrief(session);
  const text = await llmChat(
    "You compile a short incident brief. Use only the memories given. Be concise.",
    `Session: ${session.title}\nMemories:\n${(session.memories || []).map((m) => `- [${m.type}/${m.status}] ${m.title}: ${m.body.slice(0, 200)}`).join("\n")}\nWrite a 2-sentence executive summary.`);
  if (text) brief.summary = text;
  brief.llm = text ? "meta" : "deterministic";
  return brief;
}

const STOP = new Set("the a an is are was were what why how do does did to of in on for and or it this that with".split(" "));
export function searchMemories(query, pool) {
  const terms = [...new Set(String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)))];
  return pool.map((m) => {
    const hayTokens = new Set(`${m.title} ${m.body} ${(m.tags || []).join(" ")}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const hits = terms.filter((t) => t.length >= 3 && hayTokens.has(t)).length;
    const recency = Math.max(0, 1 - (Date.now() - new Date(m.updated_at).getTime()) / (90 * 864e5));
    let score = hits * 2 + recency * 0.5 + m.confidence;
    if (m.status === "stale" || isStale(m)) score -= 0.7;
    if (m.status === "deprecated" || m.status === "superseded") score -= 5;
    return { memory: m, hits, score: Number(score.toFixed(2)) };
  }).filter((r) => r.hits > 0).sort((a, b) => b.score - a.score);
}

export async function groundedAsk(query, sessionId) {
  const pool = (sessionId ? (getSession(sessionId)?.memories || []) : listMemories()).map(withMeta);
  const ranked = searchMemories(query, pool);
  if (!ranked.length || ranked[0].hits === 0) {
    return { answer: "I don't know. No memory in Tribe covers this, so I won't guess. Capture it as a memory once you find out.", citations: [], dontKnow: true };
  }
  const top = ranked.slice(0, 3);
  const citations = top.map((r, i) => ({ n: i + 1, memory_id: r.memory.id, title: r.memory.title, status: r.memory.status, stale: r.memory.stale }));
  const evidence = top.map((r, i) => `[${i + 1}] ${r.memory.title} (${r.memory.type}, confidence ${r.memory.confidence.toFixed(2)}): ${r.memory.body}`).join("\n");
  const llmText = await llmChat(
    "Answer only from the evidence. Cite like [1]. If evidence is insufficient, say exactly: I don't know.",
    `Question: ${query}\nEvidence:\n${evidence}`);
  const answer = llmText || top.map((r, i) => `${r.memory.body.split(".")[0]}. [${i + 1}]`).join(" ");
  return { answer, citations, dontKnow: answer.startsWith("I don't know"), ranked: top.map((r) => ({ memory_id: r.memory.id, score: r.score })) };
}

export function guardrailCheck(action) {
  const text = String(action).toLowerCase();
  const hits = listMemories().filter((m) => m.type === "guardrail" && m.status === "active")
    .filter((g) => {
      const keys = `${g.title} ${g.body}`.toLowerCase();
      return text.split(/\s+/).some((w) => w.length > 3 && keys.includes(w)) &&
        /kubectl delete|delete pods|drop table|grant|prod/.test(text);
    });
  return hits.length
    ? { blocked: true, guardrails: hits, message: `Stop. ${hits[0].title}. ${hits[0].body.split(".")[0]}.` }
    : { blocked: false, guardrails: [], message: "No guardrail matched this action." };
}

