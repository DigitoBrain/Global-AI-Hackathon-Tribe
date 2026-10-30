import { useEffect, useState } from "react";

type Memory = {
  id: number; title: string; body: string; type: string; tags: string[];
  confidence: number; source: string; status: string; stale: boolean; versions: number;
  last_verified: string; scope?: string; severity?: string;
};
type Brief = {
  summary: string; llm?: string; memory_count: number; entities: string[];
  open_questions: string[]; timeline: { at: string; title: string; type: string; status: string }[];
  guardrails: Memory[]; attempts: Memory[];
};
type AskResult = { answer: string; dontKnow: boolean; citations: { n: number; title: string; status: string; stale: boolean }[] };

const api = async (path: string, opts?: RequestInit) => {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const ago = (iso: string) => `${Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 864e5))}d ago`;

export default function App() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [health, setHealth] = useState<{ llm?: { mode: string }; note?: string } | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [dump, setDump] = useState("");
  const [dumpTitle, setDumpTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("What caused the checkout latency regression?");
  const [ask, setAsk] = useState<AskResult | null>(null);
  const [action, setAction] = useState("kubectl delete pods -n prod checkout");
  const [guard, setGuard] = useState<{ blocked: boolean; message: string } | null>(null);
  const [share, setShare] = useState("");
  const [filter, setFilter] = useState("all");

  const load = async () => {
    const [mems, sessions, h] = await Promise.all([api("/api/memories"), api("/api/sessions"), api("/api/health")]);
    setMemories(mems); setHealth(h);
    const sid = sessions[0]?.id ?? null; setSessionId(sid);
    if (sid) setBrief(await api(`/api/sessions/${sid}/brief`));
  };
  useEffect(() => { load().catch((e) => setNotice(String(e))); }, []);

  const capture = async () => {
    if (!dump.trim()) return;
    const r = await api("/api/memories", { method: "POST", body: JSON.stringify({ title: dumpTitle || "Captured without filing", body: dump, type: "note", source: "dump-box" }) });
    setNotice(r.redactions ? `Captured. ${r.redactions} secret(s) redacted before storage.` : "Captured. Tribe filed it — no folder decision needed.");
    setDump(""); setDumpTitle(""); load();
  };
  const doAsk = async () => setAsk(await api("/api/ask", { method: "POST", body: JSON.stringify({ question, sessionId }) }));
  const check = async () => setGuard(await api("/api/guardrail-check", { method: "POST", body: JSON.stringify({ action }) }));
  const reset = async () => { await api("/api/reset", { method: "POST" }); setAsk(null); setGuard(null); setShare(""); load(); };
  const makeShare = () => brief && setShare(
    `Tribe share — Checkout latency\n${brief.summary}\nDo: check pool saturation, use rollout-restart wrapper.\nNever: kubectl delete pods in prod checkout.\nOpen: ${brief.open_questions.join(" ")}`);
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

      <section className="panel capture">
        <h2>1 · Dump anything. Tribe files it.</h2>
        <input placeholder="Title (optional — Tribe will file it anyway)" value={dumpTitle} onChange={(e) => setDumpTitle(e.target.value)} />
        <textarea rows={3} placeholder="Paste a log, snippet, decision, failure… try including api_key=sk-test1234567890 to see scrubbing" value={dump} onChange={(e) => setDump(e.target.value)} />
        <button className="primary" onClick={capture}>Capture memory</button>
      </section>

      <div className="grid">
        <section className="panel">
          <h2>2 · Compiled brief — Checkout latency regression</h2>
          {!brief ? <p>Loading…</p> : <>
            <p className="summary">{brief.summary}</p>
            <p className="meta">{brief.memory_count} memories · compiled by {brief.llm === "meta" ? "Meta model" : "deterministic compiler"} · entities: {brief.entities.join(", ") || "—"}</p>
            <h3>Timeline</h3>
            <ul>{brief.timeline.map((t, i) => <li key={i}><code>{t.type}</code> {t.title} <span className="meta">({t.status}, {ago(t.at)})</span></li>)}</ul>
            <h3>Open questions</h3>
            <ul>{brief.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            <button onClick={makeShare}>Compile share slice (Slack-ready)</button>
            {share && <pre className="share">{share}</pre>}
          </>}
        </section>

        <section className="panel danger">
          <h2>3 · Guardrail — what NOT to do</h2>
          <input value={action} onChange={(e) => setAction(e.target.value)} />
          <button className="danger-btn" onClick={check}>Check this action</button>
          {guard && <p className={guard.blocked ? "blocked" : "clear"}>{guard.message}</p>}
          <p className="meta">Seed guardrail: never delete checkout pods in prod — it bypassed the snapshot hook on Mar 3. Safe path: rollout-restart wrapper.</p>
        </section>
      </div>

      <section className="panel">
        <h2>4 · Grounded Ask — cited, or “I don’t know”</h2>
        <div className="row">
          <input className="grow" value={question} onChange={(e) => setQuestion(e.target.value)} />
          <button className="primary" onClick={doAsk}>Ask Tribe</button>
        </div>
        <div className="row chips">
          <button onClick={() => setQuestion("What caused the checkout latency regression?")}>What caused it?</button>
          <button onClick={() => setQuestion("Should we raise the pool to 200?")}>Raise pool to 200?</button>
          <button onClick={() => setQuestion("What is our office Wi-Fi password?")}>No-evidence question</button>
        </div>
        {ask && <div className={ask.dontKnow ? "answer idk" : "answer"}>
          <p>{ask.answer}</p>
          {ask.citations.length > 0 && <p className="meta">Sources: {ask.citations.map((c) => `[${c.n}] ${c.title}${c.stale ? " (stale)" : ""}`).join(" · ")}</p>}
        </div>}
      </section>

      <section className="panel">
        <h2>5 · Memories — latest verified wins, stale is demoted</h2>
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

      <footer>Private by default. Share a compiled slice when you choose; recipients fork it into their own Tribe. MCP: <code>npm run mcp</code> exposes pull_context / push_context over this same store.</footer>
    </div>
  );
}
