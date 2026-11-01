import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = () => path.join(repoRoot, "data", "tribe.db");
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();

export function seedIfEmpty() {
  const db = new DatabaseSync(dbPath());
  const count = db.prepare("SELECT COUNT(*) c FROM memories").get().c;
  if (count > 0) { db.close(); return false; }
  const mem = db.prepare(
    `INSERT INTO memories (title,body,type,tags,confidence,source,status,supersedes_id,scope,severity,created_at,updated_at,last_verified)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const rows = [
    ["Checkout latency runbook (current)", "When checkout p95 rises: check DB connection pool saturation first, then payment webhook retry rate. Use `kubectl rollout restart deploy/checkout` via the wrapper script, never delete pods directly. Verify pool metrics for 10 minutes before escalating.", "runbook", ["checkout", "runbook", "latency"], 0.92, "incident-review", "active", null, "", "", 6, 1],
    ["OLD: restart checkout pods first", "Old advice: delete checkout pods immediately when latency rises and let Kubernetes recreate them. This predates the snapshot hook and is unsafe.", "runbook", ["checkout", "latency"], 0.4, "slack-2025", "superseded", 1, "", "", 90, 90],
    ["Root cause: pool exhaustion after deploy", "Checkout latency regression was caused by DB connection pool exhaustion after a deploy reduced effective pool headroom while payment webhook retries amplified load. Evidence: pool wait queue spiked 40s before p95 latency. Fix kept pool at 50 and added queue-time alerting.", "decision", ["checkout", "postgres", "pool"], 0.9, "incident-review", "active", null, "", "", 5, 1],
    ["Never delete checkout pods in prod", "Never run `kubectl delete pods` in the prod checkout namespace. It bypasses the snapshot hook and corrupted a replica on Mar 3. Use the rollout-restart wrapper instead.", "guardrail", ["checkout", "kubernetes", "prod"], 0.95, "incident-mar-3", "active", null, "prod/checkout", "high", 60, 2],
    ["Rejected: raise pool 50 to 200 (never committed)", "Attempt: raised checkout DB pool from 50 to 200 locally. Testing showed DB CPU spiked and checkout p95 got worse under webhook retry load. Verdict: rejected, never committed, no PR. Do not retry without load testing.", "attempt", ["checkout", "postgres", "pool"], 0.88, "local-test", "active", null, "checkout/postgres", "", 5, 5],
    ["Private note: payment retries may amplify incidents", "Private suspicion, not for the PR: the payment provider webhook retries seem to amplify checkout incidents. Ugly but useful workaround is to watch retry rate before touching the pool. Kept in Tribe because this does not belong in public comments.", "note", ["checkout", "payments", "private"], 0.65, "personal-note", "active", null, "", "", 4, 4],
    ["Payments on-call can provide payment webhook knowledge", "Payments on-call (a person) can provide the current payment webhook retry limits, the vendor escalation path, and whether retries are safe to change. Ask via Slack #payments-oncall. Conditions: business hours IST; page only for active incidents.", "source", ["payments", "webhook", "source"], 0.85, "team-knowledge", "active", null, "", "", 3, 3],
    ["Checkout observability dashboard can provide live metrics", "The checkout observability dashboard (a system) can provide live checkout p95 latency, DB pool saturation and webhook retry rate right now. Access: internal dashboard, checkout / production overview. Conditions: read-only; VPN required.", "source", ["checkout", "metrics", "source"], 0.85, "team-knowledge", "active", null, "", "", 3, 3],
  ];
  const ids = rows.map((r) => Number(mem.run(
    r[0], r[1], "memory", JSON.stringify(r[3]), r[4], r[5], r[6], r[7], r[8], r[9],
    daysAgo(r[10]), daysAgo(Math.min(r[10], r[11])), daysAgo(r[11])).lastInsertRowid));
  // Row 2 supersedes is row 1 in spirit; store old->new link by updating superseded row is already status, keep ids sequential.
  const s = db.prepare("INSERT INTO sessions (title,status,open_questions,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("Checkout latency regression", "active",
      JSON.stringify(["What is the safe pool ceiling under load test?", "Can webhook retry rate page before latency does?"]),
      daysAgo(6), daysAgo(0));
  const sid = Number(s.lastInsertRowid);
  const link = db.prepare("INSERT INTO session_memories (session_id,memory_id) VALUES (?,?)");
  ids.forEach((id) => link.run(sid, id));
  try {
    db.prepare("INSERT OR IGNORE INTO links (from_id,to_id,kind,created_at) VALUES (?,?,?,?)")
      .run(ids[0], ids[1], "supersedes", daysAgo(1));
    db.prepare("UPDATE memories SET valid_to=? WHERE id=?").run(daysAgo(1), ids[1]);
  } catch { /* links/valid_to created by store on server start */ }
  db.close();
  return true;
}

export function resetSeed() {
  const db = new DatabaseSync(dbPath());
  db.exec("DELETE FROM session_memories; DELETE FROM sessions; DELETE FROM memories; DELETE FROM versions; DELETE FROM feedback; DELETE FROM messages; DELETE FROM links;");
  db.close();
  return seedIfEmpty();
}
