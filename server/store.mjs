import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrubSecrets } from "./scrub.mjs";
import { llmChat } from "./llm.mjs";

// Resolve from this file (repo root), not process.cwd(), so the MCP server
// works no matter which directory the host client (VS Code, Cursor) spawns it from.
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(repoRoot, "data");
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
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'related', created_at TEXT NOT NULL,
  UNIQUE(from_id, to_id, kind)
);
`);
try { db.exec("ALTER TABLE messages ADD COLUMN promoted_memory_id INTEGER"); } catch { /* already present */ }
try { db.exec("ALTER TABLE memories ADD COLUMN index_keys TEXT NOT NULL DEFAULT '[]'"); } catch { /* already present */ }
try { db.exec("ALTER TABLE memories ADD COLUMN valid_to TEXT"); } catch { /* already present */ }
db.exec("UPDATE memories SET type='memory' WHERE type != 'memory'");
db.exec(`CREATE TABLE IF NOT EXISTS index_evolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id INTEGER NOT NULL, question TEXT NOT NULL,
  added_keys TEXT NOT NULL DEFAULT '[]', validated INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);`);

const now = () => new Date().toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();
const parse = (m) => ({ ...m, tags: JSON.parse(m.tags || "[]"), index_keys: JSON.parse(m.index_keys || "[]") });

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
  let answer = result.dontKnow && session.memories.length === 0
    ? "This session has no memories yet. Capture one above (it is added to this session) or attach existing memories from the list below, then ask again."
    : result.answer;
  let sourcePointers = [];
  if (result.dontKnow) {
    sourcePointers = findSourceMemories(userText);
    if (sourcePointers.length) {
      const lines = sourcePointers.map((m) => `â€¢ ${m.title}: ${m.body}`);
      answer = `${answer}\n\nNo stored answer covers this, but your tribal knowledge points to:\n${lines.join("\n")}`;
    }
  }
  const msg = addMessage(sessionId, "assistant", answer, result.citations || []);
  return { message: msg, dontKnow: result.dontKnow, temporal: Boolean(result.temporal), sources: sourcePointers };
}

const KEY_STOP = new Set("the a an is are was were what why how do does did to of in on for and or it this that with when then than from into".split(" "));

export function relatedCandidates(memory, pool, opts = {}) {
  return searchMemories(`${memory.title} ${memory.body}`, pool, opts)
    .filter((hit) => hit.hits >= 2)
    .slice(0, 2)
    .map((hit) => hit.memory);
}

export function autoLinkMemory(id) {
  const memory = getMemory(id);
  if (!memory) return [];
  const pool = listMemories().filter((m) => m.id !== id && m.status === "active");
  for (const candidate of relatedCandidates(memory, pool, { graph: graphAuthority() })) {
    createLink(id, candidate.id, "related");
  }
  return listLinksFor(id);
}
export function deterministicKeys(title, body, tags = []) {
  const words = `${title} ${body}`.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !KEY_STOP.has(w));
  const freq = new Map();
  words.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([w]) => w);
  return [...new Set([...(tags || []), title.toLowerCase(), ...top])].slice(0, 20);
}

export async function enrichMemoryKeys(id) {
  const m = getMemory(id);
  if (!m) return null;
  const text = await llmChat(
    "Generate searchable index keys for a knowledge memory. Reply with a JSON array of 8-12 short strings only: keywords, entities, and questions a user might ask that this memory answers. No prose.",
    `Title: ${m.title}\nBody: ${m.body.slice(0, 800)}`);
  let proposed = [];
  if (text) { try { proposed = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)); } catch { proposed = []; } }
  const merged = [...new Set([...m.index_keys, ...proposed.filter((k) => typeof k === "string" && k.length < 90)])].slice(0, 30);
  db.prepare("UPDATE memories SET index_keys=? WHERE id=?").run(JSON.stringify(merged), id);
  return getMemory(id);
}

export function backfillKeys() {
  for (const m of listMemories()) {
    if (!m.index_keys?.length) {
      db.prepare("UPDATE memories SET index_keys=? WHERE id=?")
        .run(JSON.stringify(deterministicKeys(m.title, m.body, m.tags)), m.id);
    }
  }
}

export function createMemory(input) {
  const scrubbed = scrubSecrets(input.body || "");
  const t = now();
  const r = db.prepare(
    `INSERT INTO memories (title,body,type,tags,confidence,source,status,supersedes_id,scope,severity,created_at,updated_at,last_verified,index_keys)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    input.title || "Untitled memory", scrubbed.text, "memory",
    "[]", input.confidence ?? 0.8, input.source || "manual",
    input.status || "active", input.supersedes_id || null, "", "", t, t, t,
    JSON.stringify(input.index_keys?.length ? input.index_keys : deterministicKeys(input.title || "", scrubbed.text, input.tags || [])));
  const id = Number(r.lastInsertRowid);
  autoLinkMemory(id);
  return { memory: getMemory(id), redactions: scrubbed.redactions };
}

export function updateMemory(id, input) {
  const old = getMemory(id);
  if (!old) return null;
  db.prepare("INSERT INTO versions (memory_id,title,body,created_at) VALUES (?,?,?,?)")
    .run(id, old.title, old.body, now());
  const scrubbed = scrubSecrets(input.body ?? old.body);
  const nextStatus = input.status ?? old.status;
  db.prepare("UPDATE memories SET title=?,body=?,type='memory',status=?,confidence=?,valid_to=?,updated_at=? WHERE id=?")
    .run(input.title ?? old.title, scrubbed.text,
      nextStatus, input.confidence ?? old.confidence,
      nextStatus === "superseded" ? (old.valid_to || now()) : old.valid_to, now(), id);
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
  return { ...m, stale: isStale(m), versions: versionCount(m.id), connections: listLinksFor(m.id) };
}

export function createLink(fromId, toId, kind = "related") {
  if (!getMemory(fromId) || !getMemory(toId) || fromId === toId) return null;
  db.prepare("INSERT OR IGNORE INTO links (from_id,to_id,kind,created_at) VALUES (?,?,?,?)")
    .run(fromId, toId, kind, now());
  if (kind === "supersedes") {
    db.prepare("UPDATE memories SET supersedes_id=?,updated_at=? WHERE id=?").run(toId, now(), fromId);
    db.prepare("UPDATE memories SET status='superseded',valid_to=?,updated_at=? WHERE id=?").run(now(), now(), toId);
  }
  return listLinksFor(fromId);
}

export function listLinksFor(memoryId) {
  const out = db.prepare(
    `SELECT l.kind, m.id, m.title FROM links l JOIN memories m ON m.id=l.to_id WHERE l.from_id=?`).all(memoryId)
    .map((r) => ({ memory_id: r.id, title: r.title, kind: r.kind, direction: "to" }));
  const inc = db.prepare(
    `SELECT l.kind, m.id, m.title FROM links l JOIN memories m ON m.id=l.from_id WHERE l.to_id=?`).all(memoryId)
    .map((r) => ({ memory_id: r.id, title: r.title, kind: r.kind, direction: "from" }));
  return [...out, ...inc];
}

export function deriveMemoryTitle(content) {
  const first = String(content).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] || "Session memory";
  return first.length > 72 ? `${first.slice(0, 69)}â€¦` : first;
}

export function promoteMessage(sessionId, messageId) {
  const msg = db.prepare("SELECT * FROM messages WHERE id=? AND session_id=?").get(messageId, sessionId);
  if (!msg) return null;
  if (msg.promoted_memory_id) return { memory: withMeta(getMemory(msg.promoted_memory_id)), already: true };
  const { memory } = createMemory({
    title: deriveMemoryTitle(msg.content), body: msg.content, source: "context-session",
  });
  attachMemory(sessionId, memory.id);
  const citations = JSON.parse(msg.citations || "[]");
  for (const c of citations) if (c.memory_id) createLink(memory.id, c.memory_id, "derived_from");
  if (!citations.length) {
    const related = searchMemories(msg.content, listMemories().filter((m) => m.id !== memory.id)).slice(0, 2);
    for (const r of related) createLink(memory.id, r.memory.id, "related");
  }
  db.prepare("UPDATE messages SET promoted_memory_id=? WHERE id=?").run(memory.id, messageId);
  return { memory: withMeta(getMemory(memory.id)), already: false };
}

const memoryHay = (m) => `${m.title} ${m.body}`.toLowerCase();
export function isProhibitionMemory(m) {
  return /\b(never|do not|don't|must not|avoid|blocked|dangerous)\b/.test(memoryHay(m));
}
export function isTriedMemory(m) {
  return /\b(tried|attempt|rejected|never committed|testing failed|test failed|abandoned)\b/.test(memoryHay(m));
}
export function isProviderMemory(m) {
  return /\b(can provide|ask via|contact|who can provide|provides access|dashboard can|on-call can)\b/.test(memoryHay(m));
}

export function compileBrief(session) {
  const mems = session.memories || [];
  const active = mems.filter((m) => m.status !== "deprecated");
  const latest = [...active].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
  const watchFor = active.filter(isProhibitionMemory);
  const alreadyTried = active.filter(isTriedMemory);
  const entities = [...new Set(active.flatMap((m) => m.tags))].slice(0, 8);
  const summary = latest
    ? `${session.title}: ${active.length} memories. Most recently updated: ${latest.title}. ${watchFor.length} warning(s), ${alreadyTried.length} tried-and-settled item(s). Current verified knowledge wins; retired knowledge stays in history.`
    : `${session.title}: no memories yet.`;
  return {
    session_id: session.id, title: session.title, summary,
    timeline: active.map((m) => ({ at: m.created_at, title: m.title, status: m.status })),
    open_questions: session.open_questions, entities, watch_for: watchFor, already_tried: alreadyTried,
    memory_count: active.length, compiled_at: now(),
  };
}

export async function compileBriefSmart(session) {
  const brief = compileBrief(session);
  const text = await llmChat(
    "You compile a short incident brief. Use only the memories given. Be concise.",
    `Session: ${session.title}\nMemories:\n${(session.memories || []).map((m) => `- [${m.status}] ${m.title}: ${m.body.slice(0, 200)}`).join("\n")}\nWrite a 2-sentence executive summary.`);
  if (text) brief.summary = text;
  brief.llm = text ? "meta" : "deterministic";
  return brief;
}

const STOP = new Set("the a an is are was were what why how do does did to of in on for and or it this that with when who which where there their about would could should our".split(" "));
const tok = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// Multi-index retrieval: independent signals are scored separately, then fused.
// Signals: keyword (title/body/tags), learned keys (evolving index), chronology
// (last-verified recency), trust (confidence, gated by status), graph authority
// (incoming links/citations), session (membership in the active session pool).
export function searchMemories(query, pool, opts = {}) {
  const terms = [...new Set(tok(query).filter((w) => w && !STOP.has(w)))];
  const usable = terms.filter((t) => t.length >= 3);
  return pool.map((m) => {
    const hayTokens = new Set(tok(`${m.title} ${m.body} ${(m.tags || []).join(" ")}`));
    const keyTokens = new Set(tok((m.index_keys || []).join(" ")));
    const bodyHits = usable.filter((t) => hayTokens.has(t));
    const keyHits = usable.filter((t) => !hayTokens.has(t) && keyTokens.has(t));
    const hits = bodyHits.length + keyHits.length;
    const signals = {
      keyword: usable.length ? bodyHits.length / usable.length : 0,
      learned_keys: usable.length ? keyHits.length / usable.length : 0,
      chronology: Math.max(0, 1 - (Date.now() - new Date(m.last_verified || m.updated_at).getTime()) / (90 * 864e5)),
      trust: m.confidence ?? 0.5,
      graph: Math.min(((opts.graph?.get(m.id)) || 0) / 3, 1),
      session: opts.sessionIds?.has(m.id) ? 1 : 0,
    };
    let score = signals.keyword * 3 + signals.learned_keys * 2.5 + signals.chronology * 1.2
      + signals.trust * 0.8 + signals.graph * 0.6 + signals.session * 0.4 + hits * 0.5;
    if (m.status === "stale" || isStale(m)) score -= 0.7;
    if (m.status === "deprecated" || m.status === "superseded") score -= 5;
    const why = [];
    if (bodyHits.length) why.push(`matches ${bodyHits.slice(0, 4).join(", ")}`);
    if (keyHits.length) why.push(`found via learned keys: ${keyHits.slice(0, 3).join(", ")}`);
    if (signals.chronology > 0.8) why.push("recently verified");
    else if (m.status === "active" && isStale(m)) why.push("stale â€” demoted");
    if (signals.graph > 0) why.push("linked from other memories");
    if (signals.session) why.push("in this session");
    if (m.status === "superseded") why.push("superseded â€” history only");
    return { memory: m, hits, score: Number(score.toFixed(2)), signals, why };
  }).filter((r) => r.hits > 0).sort((a, b) => b.score - a.score);
}

export function graphAuthority() {
  const map = new Map();
  for (const row of db.prepare("SELECT to_id, COUNT(*) c FROM links GROUP BY to_id").all()) map.set(row.to_id, row.c);
  return map;
}

// Temporal validity: current answers may only draw on currently-valid memories.
// Retired (superseded/deprecated) facts remain available to evolution/history
// questions, but can never be served as the current answer.
export function currentPool(pool, temporal) {
  return temporal ? pool : pool.filter((m) => m.status !== "superseded" && m.status !== "deprecated");
}

export function findSupersessionCandidate(memory, pool) {
  const mine = new Set(tok(`${memory.title} ${memory.body}`).filter((w) => w.length > 3 && !KEY_STOP.has(w)));
  const myNums = new Set([...`${memory.title} ${memory.body}`.matchAll(/\d+/g)].map((x) => x[0]));
  let best = null;
  for (const c of pool) {
    if (c.id === memory.id || c.status !== "active") continue;
    const sharedTag = (c.tags || []).some((t) => (memory.tags || []).includes(t));
    const theirs = new Set(tok(`${c.title} ${c.body}`).filter((w) => w.length > 3 && !KEY_STOP.has(w)));
    const overlap = [...mine].filter((w) => theirs.has(w)).length / Math.max(1, Math.min(mine.size, theirs.size));
    const theirNums = new Set([...`${c.title} ${c.body}`.matchAll(/\d+/g)].map((x) => x[0]));
    const valueDiffers = [...myNums].some((n) => !theirNums.has(n)) || [...theirNums].some((n) => !myNums.has(n));
    if (overlap >= 0.3 && (sharedTag || valueDiffers) && (!best || overlap > best.overlap)) {
      best = { memory_id: c.id, title: c.title, overlap: Number(overlap.toFixed(2)) };
    }
  }
  return best;
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
  const allPool = (sessionId ? (getSession(sessionId)?.memories || []) : listMemories()).map(withMeta);
  const temporal = isTemporalQuery(query);
  const pool = currentPool(allPool, temporal);
  const ranked = searchMemories(query, temporal ? allPool : pool, {
    graph: graphAuthority(),
    sessionIds: sessionId ? new Set(pool.map((m) => m.id)) : new Set(),
  });
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
    const evidence = chain.map((m, i) => `[${i + 1}] (${fmtDate(m.created_at)}, ${m.status}) ${m.title}: ${m.body}`).join("\n");
    const llmText = await llmChat(
      "Explain how this knowledge evolved over time, oldest to current, citing like [1]. End with the current position. Use only the evidence; if insufficient, say exactly: I don't know.",
      `Question: ${query}\nChronological evidence:\n${evidence}`);
    const answer = llmText || chain.map((m, i) => `${fmtDate(m.created_at)} â€” ${m.title}: ${m.body.split(".")[0]}. [${i + 1}]`).join(" ");
    return { answer, citations, dontKnow: answer.startsWith("I don't know"), temporal: true };
  }
  const top = ranked.slice(0, 3);
  const citations = top.map((r, i) => ({ n: i + 1, memory_id: r.memory.id, title: r.memory.title, status: r.memory.status, stale: r.memory.stale, at: r.memory.created_at, why: r.why, signals: r.signals }));
  const evidence = top.map((r, i) => `[${i + 1}] ${r.memory.title} (confidence ${r.memory.confidence.toFixed(2)}): ${r.memory.body}`).join("\n");
  const llmText = await llmChat(
    "Answer only from the evidence. Cite like [1]. If evidence is insufficient, say exactly: I don't know.",
    `Question: ${query}\nEvidence:\n${evidence}`);
  const answer = llmText || top.map((r, i) => `${r.memory.body.split(".")[0]}. [${i + 1}]`).join(" ");
  return { answer, citations, dontKnow: answer.startsWith("I don't know"), ranked: top.map((r) => ({ memory_id: r.memory.id, score: r.score })) };
}

// Self-evolving index: learn from a failed question by revising a memory's
// index keys â€” but a revision is stored only if validation shows the failed
// question now retrieves that memory and a guard question still retrieves it too.
export async function evolveIndex(question, sessionId) {
  const pool = (sessionId ? (getSession(sessionId)?.memories || []) : listMemories()).map(withMeta);
  const opts = { graph: graphAuthority(), sessionIds: new Set(pool.map((m) => m.id)) };
  const before = searchMemories(question, pool, opts);
  const candidates = pool.filter((m) => m.status === "active")
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 4);
  const results = [];
  for (const cand of candidates) {
    const llmText = await llmChat(
      "Propose 5 short index keys (phrases or likely user questions) under which this memory should be findable, given a user question it failed to answer. Reply with a JSON array of strings only.",
      `Failed question: ${question}\nMemory title: ${cand.title}\nMemory body: ${cand.body.slice(0, 600)}`);
    let proposed = [];
    if (llmText) { try { proposed = JSON.parse(llmText.slice(llmText.indexOf("["), llmText.lastIndexOf("]") + 1)); } catch { proposed = []; } }
    if (!proposed.length) proposed = [question];
    const newKeys = [...new Set([...cand.index_keys, ...proposed.filter((k) => typeof k === "string" && k.length < 90)])].slice(0, 30);
    const trialPool = pool.map((m) => m.id === cand.id ? { ...m, index_keys: newKeys } : m);
    const after = searchMemories(question, trialPool, opts);
    const guardQ = `what is ${cand.title}`;
    const guardAfter = searchMemories(guardQ, trialPool, opts);
    const improved = after.length && after[0].memory.id === cand.id;
    const noRegress = guardAfter.some((r) => r.memory.id === cand.id);
    const validated = Boolean(improved && noRegress);
    db.prepare("INSERT INTO index_evolutions (memory_id,question,added_keys,validated,created_at) VALUES (?,?,?,?,?)")
      .run(cand.id, question, JSON.stringify(proposed), validated ? 1 : 0, now());
    if (validated) {
      db.prepare("UPDATE memories SET index_keys=?,updated_at=? WHERE id=?").run(JSON.stringify(newKeys), now(), cand.id);
      results.push({ memory_id: cand.id, title: cand.title, added_keys: proposed, validated: true });
      break; // one validated evolution per failed question keeps the index conservative
    }
    results.push({ memory_id: cand.id, title: cand.title, added_keys: proposed, validated: false });
  }
  return { question, before_hits: before.length, results, evolved: results.some((r) => r.validated) };
}

// Who/what-can-provide knowledge is not a separate registry or kind: it is
// ordinary tribal knowledge whose content says who or what can provide a
// data set or capability, how to ask, and under what conditions.
export function scoreSourceMemory(query, m) {
  const terms = tok(query).filter((w) => w.length >= 3 && !STOP.has(w));
  const hay = new Set(tok(`${m.title} ${m.body} ${(m.tags || []).join(" ")}`));
  return terms.filter((t) => hay.has(t)).length;
}
export function findSourceMemories(query, limit = 2) {
  return listMemories().filter((m) => m.status === "active" && isProviderMemory(m))
    .map((m) => ({ memory: m, hits: scoreSourceMemory(query, m) }))
    .filter((r) => r.hits > 0).sort((x, y) => y.hits - x.hits).slice(0, limit).map((r) => r.memory);
}

export function guardrailCheck(action) {
  const text = String(action).toLowerCase();
  const actionTerms = new Set(tok(text).filter((w) => w.length > 3));
  const hits = listMemories().filter((m) => m.status === "active" && isProhibitionMemory(m))
    .map((g) => {
      const keys = new Set(tok(`${g.title} ${g.body}`));
      const overlap = [...actionTerms].filter((w) => keys.has(w)).length;
      return { memory: g, overlap };
    })
    .filter((r) => r.overlap >= 2 && /kubectl delete|delete pods|drop table|grant|prod/.test(text))
    .sort((a, b) => b.overlap - a.overlap)
    .map((r) => r.memory);
  return hits.length
    ? { blocked: true, guardrails: hits, message: `Stop. ${hits[0].title}. ${hits[0].body.split(".")[0]}.` }
    : { blocked: false, guardrails: [], message: "No warning memory matched this action." };
}


