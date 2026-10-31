import { useEffect, useRef, useState } from "react";

type Memory = {
  id: number; title: string; body: string; type: string; tags: string[];
  confidence: number; source: string; status: string; stale: boolean; versions: number;
  last_verified: string; created_at?: string;
};
type Session = { id: number; title: string; status: string; open_questions: string[] };
type Citation = { n: number; title: string; status: string; stale?: boolean; at?: string };
type Message = { id: number; role: string; content: string; citations: Citation[]; created_at: string };
type Brief = { summary: string; llm?: string; memory_count: number; open_questions: string[] };

const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const ago = (iso: string) => `${Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 864e5))}d ago`;

export default function App() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [attachedIds, setAttachedIds] = useState<number[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [health, setHealth] = useState<{ llm?: { mode: string } } | null>(null);
  const [notice, setNotice] = useState("");
  const [dump, setDump] = useState("");
  const [dumpTitle, setDumpTitle] = useState("");
  const [intoSession, setIntoSession] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState("all");
  const [share, setShare] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const current = sessions.find((s) => s.id === sessionId);

  const load = async (keepSid?: number | null) => {
    const [mems, sess, h] = await Promise.all([api("/api/memories"), api("/api/sessions"), api("/api/health")]);
    setMemories(mems); setSessions(sess); setHealth(h);
    const wanted = keepSid !== undefined ? keepSid : sessionId;
    const sid = wanted && sess.some((s: Session) => s.id === wanted) ? wanted : (sess[0]?.id ?? null);
    setSessionId(sid);
    if (sid) {
      const [b, detail, msgs] = await Promise.all([
        api(`/api/sessions/${sid}/brief`), api(`/api/sessions/${sid}`), api(`/api/sessions/${sid}/messages`)]);
      setBrief(b); setAttachedIds((detail.memories || []).map((m: Memory) => m.id)); setMessages(msgs);
    } else { setBrief(null); setAttachedIds([]); setMessages([]); }
  };
  useEffect(() => { load().catch((e) => setNotice(String(e))); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const capture = async () => {
    if (!dump.trim()) return;
    const r = await api("/api/memories", { method: "POST", body: JSON.stringify({ title: dumpTitle || "Captured without filing", body: dump, type: "note", source: "dump-box", sessionId: intoSession ? sessionId : null }) });
    setNotice(r.redactions ? `Captured and filed${intoSession && sessionId ? " into this session" : ""}. ${r.redactions} secret(s) redacted before storage.` : `Captured and filed${intoSession && sessionId ? " into this session" : ""} — no folder decision needed.`);
    setDump(""); setDumpTitle(""); load();
  };
  const createSession = async () => {
    if (!newTitle.trim()) return;
    const s = await api("/api/sessions", { method: "POST", body: JSON.stringify({ title: newTitle.trim() }) });
    setNewTitle(""); load(s.id);
  };
  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || !sessionId || sending) return;
    setInput(""); setSending(true);
    try {
      await api(`/api/sessions/${sessionId}/chat`, { method: "POST", body: JSON.stringify({ message }) });
      await load();
    } catch (e) { setNotice(String(e)); } finally { setSending(false); }
  };
  const toggleAttach = async (m: Memory) => {
    if (!sessionId) return;
    if (attachedIds.includes(m.id)) await api(`/api/sessions/${sessionId}/memories/${m.id}`, { method: "DELETE" });
    else await api(`/api/sessions/${sessionId}/memories`, { method: "POST", body: JSON.stringify({ memoryId: m.id }) });
    load();
  };
  const makeShare = () => brief && current && setShare(
    `Tribe session — ${current.title}\n${brief.summary}\nOpen: ${brief.open_questions.join(" ") || "—"}\n(Continue this session in any Tribe client, or via MCP: pull_context session ${sessionId})`);
  const reset = async () => { await api("/api/reset", { method: "POST" }); setShare(""); load(null); };
  const shown = memories.filter((m) => filter === "all" || m.type === filter);

  return (
    <div className="page">
      <header>
        <div><h1>Tribe</h1><p>Your tribal knowledge — captured without filing, trusted because it shows its age.</p></div>
        <div className="head-actions">
          <span className={health?.llm?.mode === "meta" ? "badge ok" : "badge warn"}>{health?.llm?.mode === "meta" ? "Meta Model API live" : "Deterministic demo mode"}</span>
          <button onClick={reset}>Reset demo</button>
        </div>
      </header>
      {notice && <div className="notice">{notice}</div>}

      <section className="panel">
        <h2>1 · Dump anything. Tribe files it.</h2>
        <input placeholder="Title (optional — Tribe will file it anyway)" value={dumpTitle} onChange={(e) => setDumpTitle(e.target.value)} />
        <textarea rows={3} placeholder="Paste a log, snippet, decision, failure… try including a fake api_key to see scrubbing" value={dump} onChange={(e) => setDump(e.target.value)} />
        <label className="check"><input type="checkbox" checked={intoSession} onChange={(e) => setIntoSession(e.target.checked)} /> Add to current session</label>
        <button className="primary" onClick={capture}>Capture memory</button>
      </section>

      <section className="panel chat-panel">
        <div className="row between">
          <h2>2 · Context Session</h2>
          <span className="meta">Grounded in this session’s memories · continues via MCP in your IDE</span>
        </div>
        <div className="row">
          <select value={sessionId ?? ""} onChange={(e) => load(Number(e.target.value))}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.status})</option>)}
          </select>
          <button onClick={async () => { if (current) { await api(`/api/sessions/${current.id}`, { method: "PATCH", body: JSON.stringify({ status: current.status === "active" ? "archived" : "active" }) }); load(); } }}>
            {current?.status === "active" ? "Archive" : "Resume"}</button>
          <button onClick={makeShare}>Share / continue elsewhere</button>
        </div>
        <div className="row">
          <input className="grow" placeholder="New session — e.g. Payments timeout investigation" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <button onClick={createSession}>Create session</button>
        </div>
        {share && <pre className="share">{share}</pre>}
        {brief && <p className="briefline"><strong>Brief:</strong> {brief.summary} <span className="meta">({brief.memory_count} memories{brief.open_questions.length ? ` · open: ${brief.open_questions.join(" ")}` : ""})</span></p>}
        <div className="row">
          <input className="grow" placeholder="Add an open question for this session" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} />
          <button onClick={async () => { if (newQuestion.trim() && sessionId) { await api(`/api/sessions/${sessionId}/questions`, { method: "POST", body: JSON.stringify({ question: newQuestion.trim() }) }); setNewQuestion(""); load(); } }}>Add question</button>
        </div>

        <div className="chat">
          {messages.length === 0 && <div className="bubble assistant">This is your context session — ask anything. Answers are grounded in the memories attached to this session, cite their sources, and say “I don’t know” when there is no evidence. Try a suggestion below.</div>}
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              <p>{m.content}</p>
              {m.citations?.length > 0 && <p className="meta">Sources: {m.citations.map((c) => `[${c.n}] ${c.title}${c.at ? ` (${c.at.slice(0, 10)})` : ""}`).join(" · ")}</p>}
            </div>
          ))}
          {sending && <div className="bubble assistant">Thinking from this session’s memories…</div>}
          <div ref={bottomRef} />
        </div>
        <div className="row chips">
          <button onClick={() => send("What caused the checkout latency regression?")}>What caused it?</button>
          <button onClick={() => send("Should we raise the pool to 200?")}>Raise pool to 200?</button>
          <button onClick={() => send("How has our checkout guidance changed over time?")}>How has guidance changed?</button>
          <button onClick={() => send("kubectl delete pods in prod checkout — is that OK?")}>Check a dangerous action</button>
          <button onClick={() => send("What is our office Wi-Fi password?")}>No-evidence question</button>
        </div>
        <div className="row composer">
          <input className="grow" placeholder="Ask this session… (Enter to send)" value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button className="primary" onClick={() => send()} disabled={sending}>Send</button>
        </div>
      </section>

      <section className="panel">
        <h2>3 · Memories — latest verified wins, stale is demoted</h2>
        <div className="row chips">
          {["all", "runbook", "guardrail", "attempt", "decision", "note"].map((f) =>
            <button key={f} className={filter === f ? "chip on" : "chip"} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        <div className="cards">
          {shown.map((m) => (
            <article key={m.id} className={`card ${m.type === "guardrail" ? "guard" : ""} ${m.status !== "active" ? "dim" : ""}`}>
              <div className="row between"><strong>{m.title}</strong><span className="badge">{m.type}</span></div>
              <p>{m.body}</p>
              <p className="meta">confidence {m.confidence.toFixed(2)} · verified {ago(m.last_verified)} · {m.versions} past version(s) · via {m.source}
                {m.stale && m.status === "active" ? " · STALE — check before obeying" : ""}{m.status !== "active" ? ` · ${m.status.toUpperCase()}` : ""}</p>
              <div className="row">
                <button onClick={() => toggleAttach(m)}>{attachedIds.includes(m.id) ? "In this session ✓ — remove" : "Add to session"}</button>
                <button onClick={async () => { await api(`/api/memories/${m.id}/feedback`, { method: "POST", body: JSON.stringify({ signal: "up" }) }); load(); }}>Useful</button>
                <button onClick={async () => { await api(`/api/memories/${m.id}/feedback`, { method: "POST", body: JSON.stringify({ signal: "down" }) }); load(); }}>Wrong / stale</button>
                <button onClick={async () => { await api(`/api/memories/${m.id}/verify`, { method: "POST" }); load(); }}>Verify now</button>
                {m.status === "active" && <button onClick={async () => { await api(`/api/memories/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: "deprecated" }) }); load(); }}>Deprecate</button>}
              </div>
            </article>
          ))}
        </div>
        {shown.length === 0 && <p>No memories of this type yet. Dump one above — no filing decision needed.</p>}
      </section>

      <footer>Private by default. This session travels with you: continue it here, or in an IDE via MCP (<code>list_sessions</code> · <code>create_session</code> · <code>pull_context</code> · <code>push_context</code> · <code>append_chat</code>). Run <code>npm run mcp</code> / <code>node scripts/mcp-probe.mjs</code> to see it.</footer>
    </div>
  );
}

