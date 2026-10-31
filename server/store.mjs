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
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL,
  role TEXT NOT NULL, content TEXT NOT NULL, citations TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
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

export function createSession(title) {
  const t = now();
  const r = db.prepare("INSERT INTO sessions (title,status,open_questions,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run(title || "Untitled session", "active", "[]", t, t);
  return getSession(Number(r.lastInsertRowid));
}
export function updateSession(id, input) {
  const s = getSession(id);
  if (!s) return null;
  db.prepare("UPDATE sessions SET title=?,status=?,updated_at=? WHERE id=?")
    .run(input.title ?? s.title, input.status ?? s.status, now(), id);
  return getSession(id);
}
export function attachMemory(sessionId, memoryId) {
  if (!getSession(sessionId) || !getMemory(memoryId)) return null;
  db.prepare("INSERT OR IGNORE INTO session_memories (session_id,memory_id) VALUES (?,?)").run(sessionId, memoryId);
  db.prepare("UPDATE sessions SET updated_at=? WHERE id=?").run(now(), sessionId);
  return getSession(sessionId);
}
export function detachMemory(sessionId, memoryId) {
  if (!getSession(sessionId)) return null;
  db.prepare("DELETE FROM session_memories WHERE session_id=? AND memory_id=?").run(sessionId, memoryId);
  return getSession(sessionId);
}
export function addOpenQuestion(sessionId, question) {
  const s = getSession(sessionId);
  if (!s || !question?.trim()) return null;
  const qs = [...s.open_questions, question.trim()];
  db.prepare("UPDATE sessions SET open_questions=?,updated_at=? WHERE id=?").run(JSON.stringify(qs), now(), sessionId);
  return getSession(sessionId);
}

export function isReferentialFollowup(text) {
  const t = String(text).trim();
  if (t.length > 80) return false;
  return /^(and\b|why\b|what about\b|how so\b|tell me more\b|explain\b)/i.test(t)
    || /\b(it|that|this|they|them|those)\b/i.test(t);
}

export function listMessages(sessionId) {
  return db.prepare("SELECT * FROM messages WHERE session_id=? ORDER BY id").all(sessionId)
    .map((m) => ({ ...m, citations: JSON.parse(m.citations || "[]") }));
}
export function addMessage(sessionId, role, content, citations = []) {
  const r = db.prepare("INSERT INTO messages (session_id,role,content,citations,created_at) VALUES (?,?,?,?,?)")
    .run(sessionId, role, content, JSON.stringify(citations), now());
  return { id: Number(r.lastInsertRowid), session_id: sessionId, role, content, citations, created_at: now() };
}

export async function sessionChat(sessionId, userText) {
  const session = getSession(sessionId);
  if (!session) return null;
  const history = listMessages(sessionId);
  addMessage(sessionId, "user", userText);
  const guard = guardrailCheck(userText);
  if (guard.blocked) {
    const msg = addMessage(sessionId, "assistant", guard.message,
      guard.guardrails.map((g, i) => ({ n: i + 1, memory_id: g.id, title: g.title, status: g.status, at: g.created_at })));
    return { message: msg, guardrail: true };
  }
  // Iterative chat: only a referential follow-up ("and why?", "what about it?") inherits the previous question's context.
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const retrievalQuery = lastUser && isReferentialFollowup(userText) ? `${lastUser.content} ${userText}` : userText;
  const result = await groundedAsk(retrievalQuery, sessionId);
  const answer = result.dontKnow && session.memories.length === 0
    ? "This session has no memories yet. Capture one above (it is added to this session) or attach existing memories from the list below, then ask again."
    : result.answer;
  const msg = addMessage(sessionId, "assistant", answer, result.citations || []);
  return { message: msg, dontKnow: result.dontKnow, temporal: Boolean(result.temporal) };
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
    const recency = Math.max(0, 1 - (Date.now() - new Date(m.last_verified || m.updated_at).getTime()) / (90 * 864e5));
    let score = hits * 2 + recency * 1.5 + m.confidence * 0.5;
    if (m.status === "stale" || isStale(m)) score -= 0.7;
    if (m.status === "deprecated" || m.status === "superseded") score -= 5;
    return { memory: m, hits, score: Number(score.toFixed(2)) };
  }).filter((r) => r.hits > 0).sort((a, b) => b.score - a.score);
}

export function isTemporalQuery(query) {
  return /how (has|have|did)|changed|change over|evolv|history|used to|over time|why (do|is|are) (we|it)|this way now|previously|before we/i.test(String(query));
}

export function evolutionChain(pool, topic) {
  const t = String(topic || "").toLowerCase().trim();
  if (!t) return [];
  return pool.filter((m) => (m.tags || []).some((x) => x.toLowerCase() === t)
    || `${m.title} ${m.body}`.toLowerCase().includes(t))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

const fmtDate = (iso) => new Date(iso).toISOString().slice(0, 10);

export async function groundedAsk(query, sessionId) {
  const pool = (sessionId ? (getSession(sessionId)?.memories || []) : listMemories()).map(withMeta);
  const ranked = searchMemories(query, pool);
  if (!ranked.length || ranked[0].hits === 0) {
    return { answer: "I don't know. No memory in Tribe covers this, so I won't guess. Capture it as a memory once you find out.", citations: [], dontKnow: true };
  }
  if (isTemporalQuery(query)) {
    // Evolution mode: history included (superseded too), walked oldest -> current.
    const topicTerms = ranked.slice(0, 2).flatMap((r) => r.memory.tags || []);
    let chain = evolutionChain(pool, topicTerms[0] || "");
    if (chain.length < 2) chain = [...ranked.map((r) => r.memory)].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const seen = new Set(); chain = chain.filter((m) => !seen.has(m.id) && seen.add(m.id)).slice(-6);
    const citations = chain.map((m, i) => ({ n: i + 1, memory_id: m.id, title: m.title, status: m.status, stale: m.stale, at: m.created_at }));
    const evidence = chain.map((m, i) => `[${i + 1}] (${fmtDate(m.created_at)}, ${m.type}/${m.status}) ${m.title}: ${m.body}`).join("\n");
    const llmText = await llmChat(
      "Explain how this knowledge evolved over time, oldest to current, citing like [1]. End with the current position. Use only the evidence; if insufficient, say exactly: I don't know.",
      `Question: ${query}\nChronological evidence:\n${evidence}`);
    const answer = llmText || chain.map((m, i) => `${fmtDate(m.created_at)} — ${m.title}: ${m.body.split(".")[0]}. [${i + 1}]`).join(" ");
    return { answer, citations, dontKnow: answer.startsWith("I don't know"), temporal: true };
  }
  const top = ranked.slice(0, 3);
  const citations = top.map((r, i) => ({ n: i + 1, memory_id: r.memory.id, title: r.memory.title, status: r.memory.status, stale: r.memory.stale, at: r.memory.created_at }));
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

